import { describe, expect, it } from 'vitest';
import type {
  MonthlyBalanceLine,
  MonthlyInventoryMovement,
  MonthlyPnlLine,
} from '../types/monthlyAnalysis';
import {
  buildMonthlyAnalysisSummary,
  buildMonthlyComparison,
  getPreviousPeriodKey,
  hasMinimumBalanceStructure,
  hasMinimumPnlStructure,
} from './monthlyAnalysisEngine';

const balanceLines: MonthlyBalanceLine[] = [
  { lineOrder: 1, accountCode: '1101', accountName: 'Caja y Bancos', section: 'ACTIVO_CORRIENTE', subsection: '', amountCLP: 1_000_000, isSubtotal: false },
  { lineOrder: 2, accountCode: '1201', accountName: 'Clientes', section: 'ACTIVO_CORRIENTE', subsection: '', amountCLP: 500_000, isSubtotal: false },
  { lineOrder: 3, accountCode: '1301', accountName: 'Inventario', section: 'ACTIVO_CORRIENTE', subsection: '', amountCLP: 300_000, isSubtotal: false },
  { lineOrder: 4, accountCode: '2101', accountName: 'Proveedores', section: 'PASIVO_CORRIENTE', subsection: '', amountCLP: 250_000, isSubtotal: false },
  { lineOrder: 5, accountCode: '3101', accountName: 'Capital', section: 'PATRIMONIO', subsection: '', amountCLP: 1_550_000, isSubtotal: false },
  { lineOrder: 6, accountCode: '', accountName: 'Total Activo', section: 'ACTIVO_CORRIENTE', subsection: '', amountCLP: 1_800_000, isSubtotal: true },
  { lineOrder: 7, accountCode: '', accountName: 'Total Pasivo', section: 'PASIVO_CORRIENTE', subsection: '', amountCLP: 250_000, isSubtotal: true },
  { lineOrder: 8, accountCode: '', accountName: 'Total Patrimonio', section: 'PATRIMONIO', subsection: '', amountCLP: 1_550_000, isSubtotal: true },
];

const pnlLines: MonthlyPnlLine[] = [
  { lineOrder: 1, accountCode: '4101', accountName: 'Ventas Netas', section: 'INGRESOS', subsection: '', amountCLP: 2_000_000, isSubtotal: false },
  { lineOrder: 2, accountCode: '5101', accountName: 'Costo de Venta', section: 'COSTO_VENTAS', subsection: '', amountCLP: 800_000, isSubtotal: false },
  { lineOrder: 3, accountCode: '6101', accountName: 'Gastos Operacionales', section: 'GASTOS_OPERACIONALES', subsection: '', amountCLP: 400_000, isSubtotal: false },
  { lineOrder: 4, accountCode: '', accountName: 'EBITDA', section: 'RESULTADOS', subsection: '', amountCLP: 800_000, isSubtotal: true },
  { lineOrder: 5, accountCode: '', accountName: 'Utilidad Neta', section: 'RESULTADOS', subsection: '', amountCLP: 700_000, isSubtotal: true },
];

const inventoryMovements: MonthlyInventoryMovement[] = [
  {
    sku: 'IMP-001',
    productName: 'Implante X',
    family: 'IMPLANTES',
    openingQty: 10,
    entriesQty: 5,
    exitsQty: 3,
    adjustmentsQty: 0,
    closingQty: 12,
    totalAmountCLP: 300_000,
    isUnclassified: false,
  },
  {
    sku: 'AD-001',
    productName: 'Aditamento Y',
    family: 'ADITAMENTOS',
    openingQty: 5,
    entriesQty: 1,
    exitsQty: 2,
    adjustmentsQty: 0,
    closingQty: 4,
    totalAmountCLP: 120_000,
    isUnclassified: false,
  },
  {
    sku: 'COX-001',
    productName: 'Coxxo Surgical Motor',
    family: 'MOTOR',
    openingQty: 1,
    entriesQty: 1,
    exitsQty: 0,
    adjustmentsQty: 0,
    closingQty: 2,
    totalAmountCLP: 0,
    isUnclassified: false,
  },
  {
    sku: 'KIT-404',
    productName: 'Kit sin mapa',
    family: 'KITS',
    openingQty: 2,
    entriesQty: 0,
    exitsQty: 0,
    adjustmentsQty: -1,
    closingQty: 1,
    totalAmountCLP: 0,
    isUnclassified: false,
  },
];

describe('monthlyAnalysisEngine', () => {
  it('construye KPIs financieros y de inventario consistentes', () => {
    const summary = buildMonthlyAnalysisSummary(balanceLines, pnlLines, inventoryMovements);

    expect(summary.balance.cashCLP).toBe(1_000_000);
    expect(summary.balance.accountsReceivableCLP).toBe(500_000);
    expect(summary.balance.inventoryCLP).toBe(300_000);
    expect(summary.balance.totalAssetsCLP).toBe(1_800_000);
    expect(summary.balance.workingCapitalCLP).toBe(1_550_000);

    expect(summary.pnl.revenueCLP).toBe(2_000_000);
    expect(summary.pnl.costOfSalesCLP).toBe(800_000);
    expect(summary.pnl.grossProfitCLP).toBe(1_200_000);
    expect(summary.pnl.operatingExpensesCLP).toBe(400_000);
    expect(summary.pnl.ebitdaCLP).toBe(800_000);
    expect(summary.pnl.netIncomeCLP).toBe(700_000);

    expect(summary.inventory.byFamily.IMPLANTES.exitsQty).toBe(3);
    expect(summary.inventory.byFamily.ADITAMENTOS.exitsQty).toBe(2);
    expect(summary.inventory.byFamily.IMPLANTES.closingQty).toBe(12);
    expect(summary.inventory.byFamily.ADITAMENTOS.closingQty).toBe(4);
    expect(summary.inventory.byFamily.IMPLANTES.salesAmountCLP).toBe(300_000);
    expect(summary.inventory.byFamily.ADITAMENTOS.salesAmountCLP).toBe(120_000);
    expect(summary.inventory.byFamily.MOTOR.closingQty).toBe(2);
    expect(summary.inventory.byFamily.KITS.closingQty).toBe(1);
    expect(summary.inventory.totals.closingQty).toBe(19);
    expect(summary.inventory.totals.exitsQty).toBe(5);
    expect(summary.inventory.totals.salesAmountCLP).toBe(420_000);
    expect(summary.inventory.unmappedSkuCount).toBe(0);
  });

  it('arma comparación contra el mes anterior y resuelve el período previo', () => {
    const currentSummary = buildMonthlyAnalysisSummary(balanceLines, pnlLines, inventoryMovements);
    const previousSummary = buildMonthlyAnalysisSummary(balanceLines, pnlLines, [
      { ...inventoryMovements[0], exitsQty: 2, closingQty: 13 },
      { ...inventoryMovements[1], exitsQty: 1, closingQty: 5 },
      inventoryMovements[2],
      inventoryMovements[3],
    ]);
    previousSummary.pnl.revenueCLP = 1_500_000;

    const comparison = buildMonthlyComparison('2026-02', currentSummary, '2026-01', previousSummary);

    expect(getPreviousPeriodKey('2026-01')).toBe('2025-12');
    expect(comparison.previousPeriodKey).toBe('2026-01');
    expect(comparison.pnl.find((item) => item.key === 'revenue')?.deltaValue).toBe(500_000);
    expect(comparison.inventory.find((item) => item.key === 'sales_total')?.deltaValue).toBe(2);
  });

  it('etiqueta la comparación de inventario como ventas', () => {
    const salesInventoryMovements: MonthlyInventoryMovement[] = [
      {
        sku: 'IMP-001',
        productName: 'Implante X',
        family: 'IMPLANTES',
        openingQty: 0,
        entriesQty: 0,
        exitsQty: 8,
        adjustmentsQty: 0,
        closingQty: 0,
        totalAmountCLP: 800_000,
        isUnclassified: false,
      },
    ];

    const currentSummary = buildMonthlyAnalysisSummary(balanceLines, pnlLines, salesInventoryMovements);
    const previousSummary = buildMonthlyAnalysisSummary(balanceLines, pnlLines, [
      { ...salesInventoryMovements[0], exitsQty: 5 },
    ]);

    const comparison = buildMonthlyComparison('2026-02', currentSummary, '2026-01', previousSummary);
    const totalItem = comparison.inventory.find((item) => item.key === 'sales_total');
    const implantItem = comparison.inventory.find((item) => item.key === 'sales_implants');

    expect(totalItem?.label).toBe('Ventas Totales');
    expect(totalItem?.currentValue).toBe(8);
    expect(totalItem?.deltaValue).toBe(3);
    expect(implantItem?.label).toBe('Implantes - Ventas');
  });

  it('valida estructuras mínimas de balance y ER', () => {
    expect(hasMinimumBalanceStructure(balanceLines)).toBe(true);
    expect(hasMinimumPnlStructure(pnlLines)).toBe(true);
    expect(hasMinimumBalanceStructure([{ ...balanceLines[0], section: 'OTROS' }])).toBe(false);
    expect(hasMinimumPnlStructure([{ ...pnlLines[0], section: 'OTROS' }])).toBe(false);
  });
});
