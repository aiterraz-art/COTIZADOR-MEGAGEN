export type MonthlyInventoryFamily = 'IMPLANTES' | 'ADITAMENTOS' | 'KITS' | 'MOTOR' | 'SIN_CLASIFICAR';

export type MonthlyBalanceSection =
  | 'ACTIVO_CORRIENTE'
  | 'ACTIVO_NO_CORRIENTE'
  | 'PASIVO_CORRIENTE'
  | 'PASIVO_NO_CORRIENTE'
  | 'PATRIMONIO'
  | 'OTROS';

export type MonthlyPnlSection =
  | 'INGRESOS'
  | 'COSTO_VENTAS'
  | 'GASTOS_OPERACIONALES'
  | 'OTROS_INGRESOS_EGRESOS'
  | 'RESULTADOS'
  | 'OTROS';

export interface MonthlyBalanceLine {
  lineOrder: number;
  accountCode: string;
  accountName: string;
  section: MonthlyBalanceSection;
  subsection: string;
  amountCLP: number;
  sourcePeriodKey?: string;
  isSubtotal: boolean;
}

export interface MonthlyPnlLine {
  lineOrder: number;
  accountCode: string;
  accountName: string;
  section: MonthlyPnlSection;
  subsection: string;
  amountCLP: number;
  sourcePeriodKey?: string;
  isSubtotal: boolean;
}

export interface MonthlyInventoryMovement {
  sku: string;
  productName: string;
  family: MonthlyInventoryFamily;
  openingQty: number;
  entriesQty: number;
  exitsQty: number;
  adjustmentsQty: number;
  closingQty: number;
  totalAmountCLP?: number;
  sourcePeriodKey?: string;
  isUnclassified: boolean;
}

export interface MonthlyParseResult<T> {
  fileName: string;
  rows: T[];
  warnings: string[];
  errors: string[];
  totalRows: number;
  validRows: number;
  detectedPeriodKeys: string[];
}

export interface MonthlyBalanceSummary {
  cashCLP: number;
  accountsReceivableCLP: number;
  inventoryCLP: number;
  accountsPayableCLP: number;
  currentAssetsCLP: number;
  currentLiabilitiesCLP: number;
  workingCapitalCLP: number;
  totalAssetsCLP: number;
  totalLiabilitiesCLP: number;
  equityCLP: number;
}

export interface MonthlyPnlSummary {
  revenueCLP: number;
  costOfSalesCLP: number;
  grossProfitCLP: number;
  grossMarginPercent: number;
  operatingExpensesCLP: number;
  operatingIncomeCLP: number;
  ebitdaCLP: number;
  netIncomeCLP: number;
}

export interface MonthlyInventoryFamilySummary {
  family: MonthlyInventoryFamily;
  openingQty: number;
  entriesQty: number;
  exitsQty: number;
  adjustmentsQty: number;
  closingQty: number;
  netChangeQty: number;
  skuCount: number;
}

export interface MonthlyInventorySummary {
  byFamily: Record<MonthlyInventoryFamily, MonthlyInventoryFamilySummary>;
  totals: MonthlyInventoryFamilySummary;
  unmappedSkuCount: number;
}

export interface MonthlyAnalysisSummary {
  balance: MonthlyBalanceSummary;
  pnl: MonthlyPnlSummary;
  inventory: MonthlyInventorySummary;
}

export interface MonthlyComparisonItem {
  key: string;
  label: string;
  kind: 'currency' | 'quantity' | 'percent';
  currentValue: number;
  previousValue: number | null;
  deltaValue: number | null;
  deltaPercent: number | null;
}

export interface MonthlyComparison {
  currentPeriodKey: string;
  previousPeriodKey: string | null;
  balance: MonthlyComparisonItem[];
  pnl: MonthlyComparisonItem[];
  inventory: MonthlyComparisonItem[];
}

export interface MonthlyCloseListItem {
  id: string;
  periodKey: string;
  balanceFileName: string;
  pnlFileName: string;
  inventoryFileName: string;
  summary: MonthlyAnalysisSummary;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyCloseRecord extends MonthlyCloseListItem {
  balanceLines: MonthlyBalanceLine[];
  pnlLines: MonthlyPnlLine[];
  inventoryMovements: MonthlyInventoryMovement[];
}

export interface UpsertMonthlyClosurePayload {
  periodKey: string;
  balanceFileName: string;
  pnlFileName: string;
  inventoryFileName: string;
  summary: MonthlyAnalysisSummary;
  balanceLines: MonthlyBalanceLine[];
  pnlLines: MonthlyPnlLine[];
  inventoryMovements: MonthlyInventoryMovement[];
}
