export type MonthlyInventoryFamily = 'IMPLANTES' | 'ADITAMENTOS' | 'KITS' | 'MOTOR' | 'DESPACHO' | 'SIN_CLASIFICAR';

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

export type MonthlyPnlTargetSectionKey =
  | 'REVENUE'
  | 'COST_OF_SALES'
  | 'GROSS_PROFIT'
  | 'SGA'
  | 'OPERATING_INCOME'
  | 'NON_OPERATING_INCOME'
  | 'NON_OPERATING_EXPENSES'
  | 'PROFIT_BEFORE_TAX'
  | 'INCOME_TAX'
  | 'NET_PROFIT';

export type MonthlyBalanceTargetSectionKey = 'ASSETS' | 'LIABILITIES_EQUITY';
export type MonthlyBalanceTargetRowKind = 'header' | 'detail' | 'subtotal' | 'grand_total';
export const MONTHLY_BALANCE_SOURCE_NET_INCOME_CONTROL_CODE = '__BALANCE_SOURCE_NET_INCOME_CONTROL__';

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
  salesAmountCLP: number;
  skuCount: number;
}

export interface MonthlyInventorySummary {
  byFamily: Record<MonthlyInventoryFamily, MonthlyInventoryFamilySummary>;
  totals: MonthlyInventoryFamilySummary;
  unmappedSkuCount: number;
}

export interface MonthlyManualInputs {
  adminSalaryManualCLP: number | null;
}

export interface MonthlyPnlSourceRow {
  lineOrder: number;
  accountCode: string;
  accountName: string;
  amountCLP: number;
  sourceSectionLabel: string;
  isSubtotal: boolean;
}

export interface MonthlyPnlMappedSource {
  lineOrder: number;
  accountCode: string;
  accountName: string;
  amountCLP: number;
  sourceSectionLabel: string;
}

export interface MonthlyPnlMappedLine {
  targetKey: string;
  targetLabel: string;
  sectionKey: MonthlyPnlTargetSectionKey;
  amountCLP: number;
  kind: 'detail' | 'subtotal';
  sources: MonthlyPnlMappedSource[];
  isManual?: boolean;
  notes?: string[];
}

export interface MonthlyPnlMappingTotals {
  totalCostOfSalesCLP: number;
  totalSgaCLP: number;
  totalNonOperatingIncomeCLP: number;
  totalNonOperatingExpensesCLP: number;
}

export interface MonthlyBalanceSourceRow {
  lineOrder: number;
  accountCode: string;
  accountName: string;
  amountCLP: number;
  sourceSectionLabel: string;
  isSubtotal: boolean;
}

export interface MonthlyBalanceMappedSource {
  lineOrder: number;
  accountCode: string;
  accountName: string;
  amountCLP: number;
  sourceSectionLabel: string;
}

export interface MonthlyBalanceMappedLine {
  targetKey: string;
  targetLabel: string;
  sectionKey: MonthlyBalanceTargetSectionKey;
  amountCLP: number;
  kind: MonthlyBalanceTargetRowKind;
  level: number;
  parentKey?: string;
  sources: MonthlyBalanceMappedSource[];
  notes?: string[];
}

export interface MonthlyBalanceMappingTotals {
  totalAssetsCLP: number;
  totalLiabilitiesCLP: number;
  totalEquityCLP: number;
  totalLiabilitiesAndEquityCLP: number;
}

export interface MonthlyBalanceCustomMappingResult {
  mappedLines: MonthlyBalanceMappedLine[];
  sourceRows: MonthlyBalanceSourceRow[];
  unmappedSourceLines: MonthlyBalanceSourceRow[];
  totals: MonthlyBalanceMappingTotals;
  warnings: string[];
  errors: string[];
  balanceDifferenceCLP: number;
  sourceNetIncomeControlCLP?: number | null;
  netIncomeDifferenceCLP?: number | null;
}

export interface MonthlyPnlCustomMappingResult {
  mappedLines: MonthlyPnlMappedLine[];
  sourceRows: MonthlyPnlSourceRow[];
  unmappedSourceLines: MonthlyPnlSourceRow[];
  manualInputs: MonthlyManualInputs;
  totals: MonthlyPnlMappingTotals;
  warnings: string[];
  errors: string[];
}

export interface MonthlyAnalysisSummary {
  balance: MonthlyBalanceSummary;
  pnl: MonthlyPnlSummary;
  inventory: MonthlyInventorySummary;
  manualInputs?: MonthlyManualInputs;
  customBalance?: MonthlyBalanceCustomMappingResult | null;
  customPnl?: MonthlyPnlCustomMappingResult | null;
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
  manualInputs?: MonthlyManualInputs;
  customBalance?: MonthlyBalanceCustomMappingResult | null;
  customPnl?: MonthlyPnlCustomMappingResult | null;
}
