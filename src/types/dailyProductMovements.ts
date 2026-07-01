export type ProductMovementDirection = 'entry' | 'exit' | 'opening' | 'neutral';

export type ProductMovementClassification =
  | 'opening_balance'
  | 'sale_exit'
  | 'dispatch_guide'
  | 'credit_note_entry'
  | 'other';

export interface DailyProductMovementRow {
  sku: string;
  description: string;
  date: string;
  dateISO: string;
  document: string;
  documentNumber: string;
  warehouse: string;
  entryQty: number;
  exitQty: number;
  balanceQty: number;
  unitValueCLP: number;
  entryAmountCLP: number;
  exitAmountCLP: number;
  balanceAmountCLP: number;
  unitCostCLP: number;
  direction: ProductMovementDirection;
  classification: ProductMovementClassification;
  effectiveQty: number;
  effectiveAmountCLP: number;
}

export interface DailyProductMovementDocumentSummary {
  document: string;
  classification: ProductMovementClassification;
  rows: number;
  entryRows: number;
  exitRows: number;
  openingRows: number;
  entryQty: number;
  exitQty: number;
  entryAmountCLP: number;
  exitAmountCLP: number;
}

export interface DailyProductMovementsParseResult {
  sourcePeriodLabel: string;
  rows: DailyProductMovementRow[];
  documentSummaries: DailyProductMovementDocumentSummary[];
  unknownDocuments: string[];
  totalRows: number;
  openingRows: number;
  movementRows: number;
  totalEntryQty: number;
  totalExitQty: number;
  totalEntryAmountCLP: number;
  totalExitAmountCLP: number;
  dateFrom?: string;
  dateTo?: string;
}
