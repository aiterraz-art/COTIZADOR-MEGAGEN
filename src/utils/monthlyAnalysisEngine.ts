import type {
  MonthlyAnalysisSummary,
  MonthlyBalanceLine,
  MonthlyComparison,
  MonthlyComparisonItem,
  MonthlyInventoryFamily,
  MonthlyInventoryFamilySummary,
  MonthlyInventoryMovement,
  MonthlyPnlLine,
} from '../types/monthlyAnalysis';

const normalize = (text: string): string => text
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim();

const familyOrder: MonthlyInventoryFamily[] = ['IMPLANTES', 'KITS', 'MOTOR', 'ADITAMENTOS', 'SIN_CLASIFICAR'];

const asPositiveMagnitude = (value: number): number => (value < 0 ? Math.abs(value) : value);

const matchesAnyKeyword = (value: string, keywords: string[]): boolean => {
  const normalizedValue = normalize(value);
  return keywords.some((keyword) => normalizedValue.includes(normalize(keyword)));
};

const sumBalanceDetails = (
  lines: MonthlyBalanceLine[],
  predicate: (line: MonthlyBalanceLine) => boolean,
): number => lines
  .filter((line) => !line.isSubtotal)
  .filter(predicate)
  .reduce((acc, line) => acc + line.amountCLP, 0);

const findBalanceExplicitTotal = (
  lines: MonthlyBalanceLine[],
  keywords: string[],
): number | null => {
  const match = lines.find((line) => matchesAnyKeyword(line.accountName, keywords));
  return match ? asPositiveMagnitude(match.amountCLP) : null;
};

const sumPnlDetails = (
  lines: MonthlyPnlLine[],
  predicate: (line: MonthlyPnlLine) => boolean,
  absolute = false,
): number => lines
  .filter((line) => !line.isSubtotal)
  .filter(predicate)
  .reduce((acc, line) => acc + (absolute ? asPositiveMagnitude(line.amountCLP) : line.amountCLP), 0);

const findPnlExplicitValue = (
  lines: MonthlyPnlLine[],
  keywords: string[],
  absolute = false,
): number | null => {
  const match = lines.find((line) => matchesAnyKeyword(line.accountName, keywords));
  if (!match) return null;
  return absolute ? asPositiveMagnitude(match.amountCLP) : match.amountCLP;
};

const emptyFamilySummary = (family: MonthlyInventoryFamily): MonthlyInventoryFamilySummary => ({
  family,
  openingQty: 0,
  entriesQty: 0,
  exitsQty: 0,
  adjustmentsQty: 0,
  closingQty: 0,
  netChangeQty: 0,
  salesAmountCLP: 0,
  skuCount: 0,
});

export const buildMonthlyAnalysisSummary = (
  balanceLines: MonthlyBalanceLine[],
  pnlLines: MonthlyPnlLine[],
  inventoryMovements: MonthlyInventoryMovement[],
): MonthlyAnalysisSummary => {
  const cashCLP = sumBalanceDetails(balanceLines, (line) => matchesAnyKeyword(line.accountName, ['caja', 'banco', 'efectivo']));
  const accountsReceivableCLP = sumBalanceDetails(balanceLines, (line) => matchesAnyKeyword(line.accountName, ['cuentas por cobrar', 'clientes', 'deudores']));
  const inventoryCLP = sumBalanceDetails(balanceLines, (line) => matchesAnyKeyword(line.accountName, ['inventario', 'existencias', 'mercaderias', 'stock']));
  const accountsPayableCLP = sumBalanceDetails(balanceLines, (line) => matchesAnyKeyword(line.accountName, ['cuentas por pagar', 'proveedores', 'acreedores']));
  const currentAssetsCLP = findBalanceExplicitTotal(balanceLines, ['total activo corriente', 'total activos corrientes'])
    ?? sumBalanceDetails(balanceLines, (line) => line.section === 'ACTIVO_CORRIENTE');
  const currentLiabilitiesCLP = findBalanceExplicitTotal(balanceLines, ['total pasivo corriente', 'total pasivos corrientes'])
    ?? sumBalanceDetails(balanceLines, (line) => line.section === 'PASIVO_CORRIENTE');
  const totalAssetsCLP = findBalanceExplicitTotal(balanceLines, ['total activo', 'total activos'])
    ?? sumBalanceDetails(balanceLines, (line) => line.section === 'ACTIVO_CORRIENTE' || line.section === 'ACTIVO_NO_CORRIENTE');
  const totalLiabilitiesCLP = findBalanceExplicitTotal(balanceLines, ['total pasivo', 'total pasivos'])
    ?? sumBalanceDetails(balanceLines, (line) => line.section === 'PASIVO_CORRIENTE' || line.section === 'PASIVO_NO_CORRIENTE');
  const equityCLP = findBalanceExplicitTotal(balanceLines, ['total patrimonio', 'patrimonio total'])
    ?? sumBalanceDetails(balanceLines, (line) => line.section === 'PATRIMONIO');
  const workingCapitalCLP = currentAssetsCLP - currentLiabilitiesCLP;

  const revenueCLP = asPositiveMagnitude(
    findPnlExplicitValue(pnlLines, ['ventas netas', 'total ventas', 'total ingresos']) ?? sumPnlDetails(pnlLines, (line) => line.section === 'INGRESOS'),
  );
  const costOfSalesCLP = asPositiveMagnitude(
    findPnlExplicitValue(pnlLines, ['total costo de ventas', 'costo de venta'], true) ?? sumPnlDetails(pnlLines, (line) => line.section === 'COSTO_VENTAS', true),
  );
  const grossProfitCLP = findPnlExplicitValue(pnlLines, ['utilidad bruta', 'margen bruto'])
    ?? (revenueCLP - costOfSalesCLP);
  const operatingExpensesCLP = asPositiveMagnitude(
    findPnlExplicitValue(pnlLines, ['total gastos operacionales', 'gastos operacionales'], true)
      ?? sumPnlDetails(pnlLines, (line) => line.section === 'GASTOS_OPERACIONALES', true),
  );
  const operatingIncomeCLP = findPnlExplicitValue(pnlLines, ['utilidad operativa', 'resultado operacional'])
    ?? (grossProfitCLP - operatingExpensesCLP);
  const ebitdaCLP = findPnlExplicitValue(pnlLines, ['ebitda']) ?? operatingIncomeCLP;
  const otherIncomeExpense = sumPnlDetails(pnlLines, (line) => line.section === 'OTROS_INGRESOS_EGRESOS');
  const netIncomeCLP = findPnlExplicitValue(pnlLines, ['utilidad neta', 'resultado neto'])
    ?? (operatingIncomeCLP + otherIncomeExpense);
  const grossMarginPercent = revenueCLP > 0 ? (grossProfitCLP / revenueCLP) * 100 : 0;

  const byFamily = familyOrder.reduce<Record<MonthlyInventoryFamily, MonthlyInventoryFamilySummary>>((acc, family) => {
    acc[family] = emptyFamilySummary(family);
    return acc;
  }, {} as Record<MonthlyInventoryFamily, MonthlyInventoryFamilySummary>);

  let unmappedSkuCount = 0;
  for (const movement of inventoryMovements) {
    const currentFamily = byFamily[movement.family];
    currentFamily.openingQty += movement.openingQty;
    currentFamily.entriesQty += movement.entriesQty;
    currentFamily.exitsQty += movement.exitsQty;
    currentFamily.adjustmentsQty += movement.adjustmentsQty;
    currentFamily.closingQty += movement.closingQty;
    currentFamily.netChangeQty += movement.closingQty - movement.openingQty;
    currentFamily.salesAmountCLP += movement.totalAmountCLP ?? 0;
    currentFamily.skuCount += 1;

    if (movement.isUnclassified) {
      unmappedSkuCount += 1;
    }
  }

  const totals = familyOrder.reduce<MonthlyInventoryFamilySummary>((acc, family) => {
    const familySummary = byFamily[family];
    acc.openingQty += familySummary.openingQty;
    acc.entriesQty += familySummary.entriesQty;
    acc.exitsQty += familySummary.exitsQty;
    acc.adjustmentsQty += familySummary.adjustmentsQty;
    acc.closingQty += familySummary.closingQty;
    acc.netChangeQty += familySummary.netChangeQty;
    acc.salesAmountCLP += familySummary.salesAmountCLP;
    acc.skuCount += familySummary.skuCount;
    return acc;
  }, emptyFamilySummary('SIN_CLASIFICAR'));

  return {
    balance: {
      cashCLP,
      accountsReceivableCLP,
      inventoryCLP,
      accountsPayableCLP,
      currentAssetsCLP,
      currentLiabilitiesCLP,
      workingCapitalCLP,
      totalAssetsCLP,
      totalLiabilitiesCLP,
      equityCLP,
    },
    pnl: {
      revenueCLP,
      costOfSalesCLP,
      grossProfitCLP,
      grossMarginPercent,
      operatingExpensesCLP,
      operatingIncomeCLP,
      ebitdaCLP,
      netIncomeCLP,
    },
    inventory: {
      byFamily,
      totals: {
        ...totals,
        family: 'SIN_CLASIFICAR',
      },
      unmappedSkuCount,
    },
  };
};

const compareMetric = (
  key: string,
  label: string,
  kind: MonthlyComparisonItem['kind'],
  currentValue: number,
  previousValue: number | null,
): MonthlyComparisonItem => {
  const deltaValue = previousValue === null ? null : currentValue - previousValue;
  const deltaPercent = previousValue === null || previousValue === 0
    ? null
    : ((currentValue - previousValue) / Math.abs(previousValue)) * 100;

  return {
    key,
    label,
    kind,
    currentValue,
    previousValue,
    deltaValue,
    deltaPercent,
  };
};

export const buildMonthlyComparison = (
  currentPeriodKey: string,
  currentSummary: MonthlyAnalysisSummary,
  previousPeriodKey: string | null,
  previousSummary: MonthlyAnalysisSummary | null,
): MonthlyComparison => {
  return {
    currentPeriodKey,
    previousPeriodKey,
    balance: [
      compareMetric('cash', 'Caja', 'currency', currentSummary.balance.cashCLP, previousSummary?.balance.cashCLP ?? null),
      compareMetric('accounts_receivable', 'Cuentas por Cobrar', 'currency', currentSummary.balance.accountsReceivableCLP, previousSummary?.balance.accountsReceivableCLP ?? null),
      compareMetric('inventory_value', 'Inventario', 'currency', currentSummary.balance.inventoryCLP, previousSummary?.balance.inventoryCLP ?? null),
      compareMetric('accounts_payable', 'Cuentas por Pagar', 'currency', currentSummary.balance.accountsPayableCLP, previousSummary?.balance.accountsPayableCLP ?? null),
      compareMetric('current_assets', 'Activos Corrientes', 'currency', currentSummary.balance.currentAssetsCLP, previousSummary?.balance.currentAssetsCLP ?? null),
      compareMetric('current_liabilities', 'Pasivos Corrientes', 'currency', currentSummary.balance.currentLiabilitiesCLP, previousSummary?.balance.currentLiabilitiesCLP ?? null),
      compareMetric('working_capital', 'Capital de Trabajo', 'currency', currentSummary.balance.workingCapitalCLP, previousSummary?.balance.workingCapitalCLP ?? null),
      compareMetric('total_assets', 'Total Activos', 'currency', currentSummary.balance.totalAssetsCLP, previousSummary?.balance.totalAssetsCLP ?? null),
      compareMetric('total_liabilities', 'Total Pasivos', 'currency', currentSummary.balance.totalLiabilitiesCLP, previousSummary?.balance.totalLiabilitiesCLP ?? null),
      compareMetric('equity', 'Patrimonio', 'currency', currentSummary.balance.equityCLP, previousSummary?.balance.equityCLP ?? null),
    ],
    pnl: [
      compareMetric('revenue', 'Ventas', 'currency', currentSummary.pnl.revenueCLP, previousSummary?.pnl.revenueCLP ?? null),
      compareMetric('cost_of_sales', 'Costo de Ventas', 'currency', currentSummary.pnl.costOfSalesCLP, previousSummary?.pnl.costOfSalesCLP ?? null),
      compareMetric('gross_profit', 'Utilidad Bruta', 'currency', currentSummary.pnl.grossProfitCLP, previousSummary?.pnl.grossProfitCLP ?? null),
      compareMetric('gross_margin_percent', 'Margen Bruto %', 'percent', currentSummary.pnl.grossMarginPercent, previousSummary?.pnl.grossMarginPercent ?? null),
      compareMetric('operating_expenses', 'Gastos Operacionales', 'currency', currentSummary.pnl.operatingExpensesCLP, previousSummary?.pnl.operatingExpensesCLP ?? null),
      compareMetric('operating_income', 'Utilidad Operativa', 'currency', currentSummary.pnl.operatingIncomeCLP, previousSummary?.pnl.operatingIncomeCLP ?? null),
      compareMetric('ebitda', 'EBITDA', 'currency', currentSummary.pnl.ebitdaCLP, previousSummary?.pnl.ebitdaCLP ?? null),
      compareMetric('net_income', 'Utilidad Neta', 'currency', currentSummary.pnl.netIncomeCLP, previousSummary?.pnl.netIncomeCLP ?? null),
    ],
    inventory: [
      compareMetric('sales_total', 'Ventas Totales', 'quantity', currentSummary.inventory.totals.exitsQty, previousSummary?.inventory.totals.exitsQty ?? null),
      compareMetric('sales_implants', 'Implantes - Ventas', 'quantity', currentSummary.inventory.byFamily.IMPLANTES.exitsQty, previousSummary?.inventory.byFamily.IMPLANTES.exitsQty ?? null),
      compareMetric('sales_kits', 'Kits - Ventas', 'quantity', currentSummary.inventory.byFamily.KITS.exitsQty, previousSummary?.inventory.byFamily.KITS.exitsQty ?? null),
      compareMetric('sales_motor', 'Motor - Ventas', 'quantity', currentSummary.inventory.byFamily.MOTOR.exitsQty, previousSummary?.inventory.byFamily.MOTOR.exitsQty ?? null),
      compareMetric('sales_abutments', 'Aditamentos - Ventas', 'quantity', currentSummary.inventory.byFamily.ADITAMENTOS.exitsQty, previousSummary?.inventory.byFamily.ADITAMENTOS.exitsQty ?? null),
      compareMetric('unclassified_skus', 'SKUs sin Clasificar', 'quantity', currentSummary.inventory.unmappedSkuCount, previousSummary?.inventory.unmappedSkuCount ?? null),
    ],
  };
};

export const hasMinimumBalanceStructure = (balanceLines: MonthlyBalanceLine[]): boolean => {
  const hasAssets = balanceLines.some((line) => line.section === 'ACTIVO_CORRIENTE' || line.section === 'ACTIVO_NO_CORRIENTE');
  const hasLiabilitiesOrEquity = balanceLines.some((line) => line.section === 'PASIVO_CORRIENTE' || line.section === 'PASIVO_NO_CORRIENTE' || line.section === 'PATRIMONIO');
  return hasAssets && hasLiabilitiesOrEquity;
};

export const hasMinimumPnlStructure = (pnlLines: MonthlyPnlLine[]): boolean => {
  const hasRevenue = pnlLines.some((line) => line.section === 'INGRESOS');
  const hasCostsOrExpenses = pnlLines.some((line) => line.section === 'COSTO_VENTAS' || line.section === 'GASTOS_OPERACIONALES');
  return hasRevenue && hasCostsOrExpenses;
};

export const getPreviousPeriodKey = (periodKey: string): string | null => {
  const [yearRaw, monthRaw] = periodKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  if (month === 1) {
    return `${year - 1}-12`;
  }

  return `${year}-${String(month - 1).padStart(2, '0')}`;
};
