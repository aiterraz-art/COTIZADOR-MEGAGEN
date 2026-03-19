import { isPocketBaseProvider } from './dataProvider';
import { pocketbase } from './pocketbase';
import { supabase } from './supabase';
import type {
  MonthlyAnalysisSummary,
  MonthlyBalanceLine,
  MonthlyBalanceSection,
  MonthlyCloseListItem,
  MonthlyCloseRecord,
  MonthlyInventoryFamily,
  MonthlyInventoryMovement,
  MonthlyPnlLine,
  MonthlyPnlSection,
  UpsertMonthlyClosurePayload,
} from '../types/monthlyAnalysis';

type GenericRow = Record<string, unknown>;

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const emptySummary = (): MonthlyAnalysisSummary => ({
  balance: {
    cashCLP: 0,
    accountsReceivableCLP: 0,
    inventoryCLP: 0,
    accountsPayableCLP: 0,
    currentAssetsCLP: 0,
    currentLiabilitiesCLP: 0,
    workingCapitalCLP: 0,
    totalAssetsCLP: 0,
    totalLiabilitiesCLP: 0,
    equityCLP: 0,
  },
  pnl: {
    revenueCLP: 0,
    costOfSalesCLP: 0,
    grossProfitCLP: 0,
    grossMarginPercent: 0,
    operatingExpensesCLP: 0,
    operatingIncomeCLP: 0,
    ebitdaCLP: 0,
    netIncomeCLP: 0,
  },
  inventory: {
    byFamily: {
      IMPLANTES: { family: 'IMPLANTES', openingQty: 0, entriesQty: 0, exitsQty: 0, adjustmentsQty: 0, closingQty: 0, netChangeQty: 0, skuCount: 0 },
      KITS: { family: 'KITS', openingQty: 0, entriesQty: 0, exitsQty: 0, adjustmentsQty: 0, closingQty: 0, netChangeQty: 0, skuCount: 0 },
      MOTOR: { family: 'MOTOR', openingQty: 0, entriesQty: 0, exitsQty: 0, adjustmentsQty: 0, closingQty: 0, netChangeQty: 0, skuCount: 0 },
      ADITAMENTOS: { family: 'ADITAMENTOS', openingQty: 0, entriesQty: 0, exitsQty: 0, adjustmentsQty: 0, closingQty: 0, netChangeQty: 0, skuCount: 0 },
      SIN_CLASIFICAR: { family: 'SIN_CLASIFICAR', openingQty: 0, entriesQty: 0, exitsQty: 0, adjustmentsQty: 0, closingQty: 0, netChangeQty: 0, skuCount: 0 },
    },
    totals: { family: 'SIN_CLASIFICAR', openingQty: 0, entriesQty: 0, exitsQty: 0, adjustmentsQty: 0, closingQty: 0, netChangeQty: 0, skuCount: 0 },
    unmappedSkuCount: 0,
  },
});

const parseSummary = (value: unknown): MonthlyAnalysisSummary => {
  if (!value || typeof value !== 'object') return emptySummary();
  const row = value as GenericRow;
  return {
    balance: {
      cashCLP: toNumber((row.balance as GenericRow | undefined)?.cashCLP),
      accountsReceivableCLP: toNumber((row.balance as GenericRow | undefined)?.accountsReceivableCLP),
      inventoryCLP: toNumber((row.balance as GenericRow | undefined)?.inventoryCLP),
      accountsPayableCLP: toNumber((row.balance as GenericRow | undefined)?.accountsPayableCLP),
      currentAssetsCLP: toNumber((row.balance as GenericRow | undefined)?.currentAssetsCLP),
      currentLiabilitiesCLP: toNumber((row.balance as GenericRow | undefined)?.currentLiabilitiesCLP),
      workingCapitalCLP: toNumber((row.balance as GenericRow | undefined)?.workingCapitalCLP),
      totalAssetsCLP: toNumber((row.balance as GenericRow | undefined)?.totalAssetsCLP),
      totalLiabilitiesCLP: toNumber((row.balance as GenericRow | undefined)?.totalLiabilitiesCLP),
      equityCLP: toNumber((row.balance as GenericRow | undefined)?.equityCLP),
    },
    pnl: {
      revenueCLP: toNumber((row.pnl as GenericRow | undefined)?.revenueCLP),
      costOfSalesCLP: toNumber((row.pnl as GenericRow | undefined)?.costOfSalesCLP),
      grossProfitCLP: toNumber((row.pnl as GenericRow | undefined)?.grossProfitCLP),
      grossMarginPercent: toNumber((row.pnl as GenericRow | undefined)?.grossMarginPercent),
      operatingExpensesCLP: toNumber((row.pnl as GenericRow | undefined)?.operatingExpensesCLP),
      operatingIncomeCLP: toNumber((row.pnl as GenericRow | undefined)?.operatingIncomeCLP),
      ebitdaCLP: toNumber((row.pnl as GenericRow | undefined)?.ebitdaCLP),
      netIncomeCLP: toNumber((row.pnl as GenericRow | undefined)?.netIncomeCLP),
    },
    inventory: {
      byFamily: {
        IMPLANTES: {
          family: 'IMPLANTES',
          openingQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.IMPLANTES as GenericRow | undefined)?.openingQty),
          entriesQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.IMPLANTES as GenericRow | undefined)?.entriesQty),
          exitsQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.IMPLANTES as GenericRow | undefined)?.exitsQty),
          adjustmentsQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.IMPLANTES as GenericRow | undefined)?.adjustmentsQty),
          closingQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.IMPLANTES as GenericRow | undefined)?.closingQty),
          netChangeQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.IMPLANTES as GenericRow | undefined)?.netChangeQty),
          skuCount: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.IMPLANTES as GenericRow | undefined)?.skuCount),
        },
        ADITAMENTOS: {
          family: 'ADITAMENTOS',
          openingQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.ADITAMENTOS as GenericRow | undefined)?.openingQty),
          entriesQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.ADITAMENTOS as GenericRow | undefined)?.entriesQty),
          exitsQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.ADITAMENTOS as GenericRow | undefined)?.exitsQty),
          adjustmentsQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.ADITAMENTOS as GenericRow | undefined)?.adjustmentsQty),
          closingQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.ADITAMENTOS as GenericRow | undefined)?.closingQty),
          netChangeQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.ADITAMENTOS as GenericRow | undefined)?.netChangeQty),
          skuCount: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.ADITAMENTOS as GenericRow | undefined)?.skuCount),
        },
        KITS: {
          family: 'KITS',
          openingQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.KITS as GenericRow | undefined)?.openingQty),
          entriesQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.KITS as GenericRow | undefined)?.entriesQty),
          exitsQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.KITS as GenericRow | undefined)?.exitsQty),
          adjustmentsQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.KITS as GenericRow | undefined)?.adjustmentsQty),
          closingQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.KITS as GenericRow | undefined)?.closingQty),
          netChangeQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.KITS as GenericRow | undefined)?.netChangeQty),
          skuCount: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.KITS as GenericRow | undefined)?.skuCount),
        },
        MOTOR: {
          family: 'MOTOR',
          openingQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.MOTOR as GenericRow | undefined)?.openingQty),
          entriesQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.MOTOR as GenericRow | undefined)?.entriesQty),
          exitsQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.MOTOR as GenericRow | undefined)?.exitsQty),
          adjustmentsQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.MOTOR as GenericRow | undefined)?.adjustmentsQty),
          closingQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.MOTOR as GenericRow | undefined)?.closingQty),
          netChangeQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.MOTOR as GenericRow | undefined)?.netChangeQty),
          skuCount: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.MOTOR as GenericRow | undefined)?.skuCount),
        },
        SIN_CLASIFICAR: {
          family: 'SIN_CLASIFICAR',
          openingQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.SIN_CLASIFICAR as GenericRow | undefined)?.openingQty),
          entriesQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.SIN_CLASIFICAR as GenericRow | undefined)?.entriesQty),
          exitsQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.SIN_CLASIFICAR as GenericRow | undefined)?.exitsQty),
          adjustmentsQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.SIN_CLASIFICAR as GenericRow | undefined)?.adjustmentsQty),
          closingQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.SIN_CLASIFICAR as GenericRow | undefined)?.closingQty),
          netChangeQty: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.SIN_CLASIFICAR as GenericRow | undefined)?.netChangeQty),
          skuCount: toNumber((((row.inventory as GenericRow | undefined)?.byFamily as GenericRow | undefined)?.SIN_CLASIFICAR as GenericRow | undefined)?.skuCount),
        },
      },
      totals: {
        family: 'SIN_CLASIFICAR',
        openingQty: toNumber(((row.inventory as GenericRow | undefined)?.totals as GenericRow | undefined)?.openingQty),
        entriesQty: toNumber(((row.inventory as GenericRow | undefined)?.totals as GenericRow | undefined)?.entriesQty),
        exitsQty: toNumber(((row.inventory as GenericRow | undefined)?.totals as GenericRow | undefined)?.exitsQty),
        adjustmentsQty: toNumber(((row.inventory as GenericRow | undefined)?.totals as GenericRow | undefined)?.adjustmentsQty),
        closingQty: toNumber(((row.inventory as GenericRow | undefined)?.totals as GenericRow | undefined)?.closingQty),
        netChangeQty: toNumber(((row.inventory as GenericRow | undefined)?.totals as GenericRow | undefined)?.netChangeQty),
        skuCount: toNumber(((row.inventory as GenericRow | undefined)?.totals as GenericRow | undefined)?.skuCount),
      },
      unmappedSkuCount: toNumber((row.inventory as GenericRow | undefined)?.unmappedSkuCount),
    },
  };
};

const parseBalanceSection = (value: unknown): MonthlyBalanceSection => {
  const validValues: MonthlyBalanceSection[] = ['ACTIVO_CORRIENTE', 'ACTIVO_NO_CORRIENTE', 'PASIVO_CORRIENTE', 'PASIVO_NO_CORRIENTE', 'PATRIMONIO', 'OTROS'];
  return validValues.includes(String(value) as MonthlyBalanceSection) ? (String(value) as MonthlyBalanceSection) : 'OTROS';
};

const parsePnlSection = (value: unknown): MonthlyPnlSection => {
  const validValues: MonthlyPnlSection[] = ['INGRESOS', 'COSTO_VENTAS', 'GASTOS_OPERACIONALES', 'OTROS_INGRESOS_EGRESOS', 'RESULTADOS', 'OTROS'];
  return validValues.includes(String(value) as MonthlyPnlSection) ? (String(value) as MonthlyPnlSection) : 'OTROS';
};

const parseInventoryFamily = (value: unknown): MonthlyInventoryFamily => {
  const validValues: MonthlyInventoryFamily[] = ['IMPLANTES', 'ADITAMENTOS', 'KITS', 'MOTOR', 'SIN_CLASIFICAR'];
  return validValues.includes(String(value) as MonthlyInventoryFamily) ? (String(value) as MonthlyInventoryFamily) : 'SIN_CLASIFICAR';
};

const mapClosureListItem = (row: GenericRow): MonthlyCloseListItem => ({
  id: String(row.id || ''),
  periodKey: String(row.period_key || ''),
  balanceFileName: String(row.balance_file_name || ''),
  pnlFileName: String(row.pnl_file_name || ''),
  inventoryFileName: String(row.inventory_file_name || ''),
  summary: parseSummary(row.summary),
  createdAt: String(row.created_at || row.created || ''),
  updatedAt: String(row.updated_at || row.updated || row.created_at || row.created || ''),
});

const mapBalanceLine = (row: GenericRow): MonthlyBalanceLine => ({
  lineOrder: toNumber(row.line_order),
  accountCode: String(row.account_code || ''),
  accountName: String(row.account_name || ''),
  section: parseBalanceSection(row.section),
  subsection: String(row.subsection || ''),
  amountCLP: toNumber(row.amount_clp),
  sourcePeriodKey: row.source_period_key ? String(row.source_period_key) : undefined,
  isSubtotal: Boolean(row.is_subtotal),
});

const mapPnlLine = (row: GenericRow): MonthlyPnlLine => ({
  lineOrder: toNumber(row.line_order),
  accountCode: String(row.account_code || ''),
  accountName: String(row.account_name || ''),
  section: parsePnlSection(row.section),
  subsection: String(row.subsection || ''),
  amountCLP: toNumber(row.amount_clp),
  sourcePeriodKey: row.source_period_key ? String(row.source_period_key) : undefined,
  isSubtotal: Boolean(row.is_subtotal),
});

const mapInventoryMovement = (row: GenericRow): MonthlyInventoryMovement => ({
  sku: String(row.sku || ''),
  productName: String(row.product_name || ''),
  family: parseInventoryFamily(row.family),
  openingQty: toNumber(row.opening_qty),
  entriesQty: toNumber(row.entries_qty),
  exitsQty: toNumber(row.exits_qty),
  adjustmentsQty: toNumber(row.adjustments_qty),
  closingQty: toNumber(row.closing_qty),
  totalAmountCLP: row.total_amount_clp == null ? undefined : toNumber(row.total_amount_clp),
  sourcePeriodKey: row.source_period_key ? String(row.source_period_key) : undefined,
  isUnclassified: Boolean(row.is_unclassified),
});

const escapePocketBaseValue = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const findPocketBaseRecordByPeriod = async (collectionName: string, periodKey: string): Promise<GenericRow | null> => {
  const items = await pocketbase.collection(collectionName).getFullList<GenericRow>({
    filter: `period_key="${escapePocketBaseValue(periodKey)}"`,
  });
  return items[0] ?? null;
};

const deletePocketBaseRecordsByPeriod = async (collectionName: string, periodKey: string): Promise<void> => {
  const rows = await pocketbase.collection(collectionName).getFullList<{ id: string }>({
    filter: `period_key="${escapePocketBaseValue(periodKey)}"`,
    fields: 'id',
  });

  for (const row of rows) {
    await pocketbase.collection(collectionName).delete(row.id);
  }
};

export const fetchMonthlyClosures = async (): Promise<MonthlyCloseListItem[]> => {
  if (!isPocketBaseProvider) {
    const { data, error } = await supabase
      .from('monthly_closures')
      .select('*')
      .order('period_key', { ascending: false });

    if (error) throw error;

    return (data ?? []).map((row) => mapClosureListItem(row as GenericRow));
  }

  const rows = await pocketbase.collection('monthly_closures').getFullList<GenericRow>({ sort: '-period_key' });
  return rows.map((row) => mapClosureListItem(row));
};

export const fetchMonthlyClosureByPeriod = async (periodKey: string): Promise<MonthlyCloseRecord | null> => {
  if (!isPocketBaseProvider) {
    const { data: header, error: headerError } = await supabase
      .from('monthly_closures')
      .select('*')
      .eq('period_key', periodKey)
      .maybeSingle();

    if (headerError) throw headerError;
    if (!header) return null;

    const [balanceLinesResult, pnlLinesResult, inventoryResult] = await Promise.all([
      supabase.from('monthly_balance_lines').select('*').eq('period_key', periodKey).order('line_order', { ascending: true }),
      supabase.from('monthly_pnl_lines').select('*').eq('period_key', periodKey).order('line_order', { ascending: true }),
      supabase.from('monthly_inventory_movements').select('*').eq('period_key', periodKey).order('sku', { ascending: true }),
    ]);

    if (balanceLinesResult.error) throw balanceLinesResult.error;
    if (pnlLinesResult.error) throw pnlLinesResult.error;
    if (inventoryResult.error) throw inventoryResult.error;

    return {
      ...mapClosureListItem(header as GenericRow),
      balanceLines: (balanceLinesResult.data ?? []).map((row) => mapBalanceLine(row as GenericRow)),
      pnlLines: (pnlLinesResult.data ?? []).map((row) => mapPnlLine(row as GenericRow)),
      inventoryMovements: (inventoryResult.data ?? []).map((row) => mapInventoryMovement(row as GenericRow)),
    };
  }

  const header = await findPocketBaseRecordByPeriod('monthly_closures', periodKey);
  if (!header) return null;

  const [balanceLines, pnlLines, inventoryMovements] = await Promise.all([
    pocketbase.collection('monthly_balance_lines').getFullList<GenericRow>({ filter: `period_key="${escapePocketBaseValue(periodKey)}"`, sort: 'line_order' }),
    pocketbase.collection('monthly_pnl_lines').getFullList<GenericRow>({ filter: `period_key="${escapePocketBaseValue(periodKey)}"`, sort: 'line_order' }),
    pocketbase.collection('monthly_inventory_movements').getFullList<GenericRow>({ filter: `period_key="${escapePocketBaseValue(periodKey)}"`, sort: 'sku' }),
  ]);

  return {
    ...mapClosureListItem(header),
    balanceLines: balanceLines.map((row) => mapBalanceLine(row)),
    pnlLines: pnlLines.map((row) => mapPnlLine(row)),
    inventoryMovements: inventoryMovements.map((row) => mapInventoryMovement(row)),
  };
};

export const upsertMonthlyClosure = async (payload: UpsertMonthlyClosurePayload): Promise<void> => {
  const headerPayload = {
    period_key: payload.periodKey,
    balance_file_name: payload.balanceFileName,
    pnl_file_name: payload.pnlFileName,
    inventory_file_name: payload.inventoryFileName,
    summary: payload.summary,
    updated_at: new Date().toISOString(),
  };

  const balanceRows = payload.balanceLines.map((line) => ({
    period_key: payload.periodKey,
    line_order: line.lineOrder,
    account_code: line.accountCode,
    account_name: line.accountName,
    section: line.section,
    subsection: line.subsection,
    amount_clp: line.amountCLP,
    source_period_key: line.sourcePeriodKey ?? payload.periodKey,
    is_subtotal: line.isSubtotal,
  }));

  const pnlRows = payload.pnlLines.map((line) => ({
    period_key: payload.periodKey,
    line_order: line.lineOrder,
    account_code: line.accountCode,
    account_name: line.accountName,
    section: line.section,
    subsection: line.subsection,
    amount_clp: line.amountCLP,
    source_period_key: line.sourcePeriodKey ?? payload.periodKey,
    is_subtotal: line.isSubtotal,
  }));

  const inventoryRows = payload.inventoryMovements.map((movement) => ({
    period_key: payload.periodKey,
    sku: movement.sku,
    product_name: movement.productName,
    family: movement.family,
    opening_qty: movement.openingQty,
    entries_qty: movement.entriesQty,
    exits_qty: movement.exitsQty,
    adjustments_qty: movement.adjustmentsQty,
    closing_qty: movement.closingQty,
    total_amount_clp: movement.totalAmountCLP ?? null,
    source_period_key: movement.sourcePeriodKey ?? payload.periodKey,
    is_unclassified: movement.isUnclassified,
  }));

  if (!isPocketBaseProvider) {
    const { data: existing, error: existingError } = await supabase
      .from('monthly_closures')
      .select('id')
      .eq('period_key', payload.periodKey)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      const { error: updateError } = await supabase
        .from('monthly_closures')
        .update(headerPayload)
        .eq('period_key', payload.periodKey);

      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from('monthly_closures')
        .insert({
          ...headerPayload,
          created_at: new Date().toISOString(),
        });

      if (insertError) throw insertError;
    }

    const [deleteBalanceResult, deletePnlResult, deleteInventoryResult] = await Promise.all([
      supabase.from('monthly_balance_lines').delete().eq('period_key', payload.periodKey),
      supabase.from('monthly_pnl_lines').delete().eq('period_key', payload.periodKey),
      supabase.from('monthly_inventory_movements').delete().eq('period_key', payload.periodKey),
    ]);

    if (deleteBalanceResult.error) throw deleteBalanceResult.error;
    if (deletePnlResult.error) throw deletePnlResult.error;
    if (deleteInventoryResult.error) throw deleteInventoryResult.error;

    if (balanceRows.length) {
      const { error } = await supabase.from('monthly_balance_lines').insert(balanceRows);
      if (error) throw error;
    }

    if (pnlRows.length) {
      const { error } = await supabase.from('monthly_pnl_lines').insert(pnlRows);
      if (error) throw error;
    }

    if (inventoryRows.length) {
      const { error } = await supabase.from('monthly_inventory_movements').insert(inventoryRows);
      if (error) throw error;
    }

    return;
  }

  const existing = await findPocketBaseRecordByPeriod('monthly_closures', payload.periodKey);
  if (existing) {
    await pocketbase.collection('monthly_closures').update(String(existing.id), headerPayload);
  } else {
    await pocketbase.collection('monthly_closures').create({
      ...headerPayload,
      created_at: new Date().toISOString(),
    });
  }

  await Promise.all([
    deletePocketBaseRecordsByPeriod('monthly_balance_lines', payload.periodKey),
    deletePocketBaseRecordsByPeriod('monthly_pnl_lines', payload.periodKey),
    deletePocketBaseRecordsByPeriod('monthly_inventory_movements', payload.periodKey),
  ]);

  for (const row of balanceRows) {
    await pocketbase.collection('monthly_balance_lines').create(row);
  }

  for (const row of pnlRows) {
    await pocketbase.collection('monthly_pnl_lines').create(row);
  }

  for (const row of inventoryRows) {
    await pocketbase.collection('monthly_inventory_movements').create(row);
  }
};

export const deleteMonthlyClosure = async (periodKey: string): Promise<void> => {
  if (!isPocketBaseProvider) {
    const [deleteHeaderResult, deleteBalanceResult, deletePnlResult, deleteInventoryResult] = await Promise.all([
      supabase.from('monthly_closures').delete().eq('period_key', periodKey),
      supabase.from('monthly_balance_lines').delete().eq('period_key', periodKey),
      supabase.from('monthly_pnl_lines').delete().eq('period_key', periodKey),
      supabase.from('monthly_inventory_movements').delete().eq('period_key', periodKey),
    ]);

    if (deleteHeaderResult.error) throw deleteHeaderResult.error;
    if (deleteBalanceResult.error) throw deleteBalanceResult.error;
    if (deletePnlResult.error) throw deletePnlResult.error;
    if (deleteInventoryResult.error) throw deleteInventoryResult.error;
    return;
  }

  const header = await findPocketBaseRecordByPeriod('monthly_closures', periodKey);
  await Promise.all([
    deletePocketBaseRecordsByPeriod('monthly_balance_lines', periodKey),
    deletePocketBaseRecordsByPeriod('monthly_pnl_lines', periodKey),
    deletePocketBaseRecordsByPeriod('monthly_inventory_movements', periodKey),
  ]);

  if (header) {
    await pocketbase.collection('monthly_closures').delete(String(header.id));
  }
};
