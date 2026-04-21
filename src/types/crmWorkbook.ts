import type { WorkBook } from 'xlsx';

export interface WeeklySalesRow {
  saleDate: string;
  clientRut: string;
  clientName: string;
  salesRep: string;
  netAmount: number;
  sourceRowIndex: number;
}

export interface WeeklySalesBatch {
  rows: WeeklySalesRow[];
  totalRows: number;
  validRows: number;
  discardedRows: number;
  periodFrom?: string;
  periodTo?: string;
  warnings: string[];
}

export interface WeeklySalesAggregate {
  normalizedRut: string;
  displayRut: string;
  clientName: string;
  salesRep: string;
  year: number;
  month: number;
  netAmountDelta: number;
  latestSaleDate: string;
}

export type MonthlySheetLayout = 'legacy_january' | 'standard';

export interface CrmMasterMonthlySheetRef {
  month: number;
  sheetName: string;
  layout: MonthlySheetLayout;
  templateRowIndex: number;
  dataStartRow: number;
  dataEndRow: number;
  appendRowIndex: number;
  totalRowIndex: number | null;
}

export interface CrmMasterCrmRowRef {
  rowIndex: number;
  salesRep: string;
  clientRut: string;
  clientName: string;
  firstSoldDate: string;
  recentSoldDate: string;
}

export interface SellerAssignmentRef {
  order: number;
  clientRut: string;
  salesRep: string;
}

export interface CrmMasterWorkbookModel {
  sourceFileName: string;
  workbook: WorkBook;
  monthlySheets: Map<number, CrmMasterMonthlySheetRef>;
  crmRowsByRut: Map<string, CrmMasterCrmRowRef>;
  crmLastRowIndex: number;
  crmTemplateRowIndex: number;
  crmSheetName: string;
  annualSheetName: string;
  annualExpectedByRut: Map<string, number | null>;
  annualTemplateRowIndex: number;
  annualTotalRowIndex: number | null;
  salesRepSheetName: string;
  salesRepAssignmentsByRut: Map<string, SellerAssignmentRef>;
  salesRepTemplateRowIndex: number;
  reportSheetName: string | null;
}

export interface ClientMutationDetail {
  clientRut: string;
  clientName: string;
  salesRep: string;
  month: number;
  netAmountDelta: number;
}

export interface SellerChangeDetail {
  clientRut: string;
  previousSalesRep: string;
  nextSalesRep: string;
}

export interface CrmWorkbookMutationSummary {
  updatedMonthlyRows: number;
  insertedMonthlyRows: number;
  createdMonthlySheets: string[];
  updatedCrmRows: number;
  insertedCrmRows: number;
  updatedSellerAssignments: number;
  insertedSellerAssignments: number;
  rebuiltAnnualRows: number;
  affectedMonths: number[];
  newClients: ClientMutationDetail[];
  updatedClients: ClientMutationDetail[];
  sellerChanges: SellerChangeDetail[];
  warnings: string[];
}

export interface CrmWorkbookUpdateResult {
  workbook: WorkBook;
  downloadFileName: string;
  summary: CrmWorkbookMutationSummary;
}
