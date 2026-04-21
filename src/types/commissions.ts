import type { WorkBook } from 'xlsx';

export type CommissionCompanyKey = 'megagen' | '3dental';
export type CommissionPeriodKey = string;
export type CommissionProductClass = 'MEGAGEN' | 'IMPLANTES' | '3DENTAL';
export type CommissionOriginType = 'current_sales' | 'carryover_saved' | 'carryover_file' | 'bootstrap';
export type CommissionLineStatus = 'paid_current' | 'paid_carryover' | 'unpaid' | 'excluded';
export type CommissionExclusionField = 'sku' | 'description';
export type CommissionExclusionOperator = 'equals' | 'contains';
export type CommissionCarryoverSourceType = 'workbook_carryover' | 'bootstrap_sales' | 'saved_closure';

export interface CommissionExclusionRule {
  id: string;
  field: CommissionExclusionField;
  operator: CommissionExclusionOperator;
  value: string;
  note: string;
}

export interface CommissionCompanyConfig {
  companyKey: CommissionCompanyKey;
  globalRatePercent: number | null;
  implantRatePercent: number | null;
  threeDentalRatePercent: number | null;
  exclusionRules: CommissionExclusionRule[];
}

export interface CommissionSalesRawLine {
  sourceRowIndex: number;
  documentType: string;
  documentNumber: string;
  clientCode: string;
  clientName: string;
  salesRep: string;
  saleDate: string;
  productCode: string;
  productDescription: string;
  quantity: number;
  netAmountCLP: number;
  productClass?: string;
}

export interface CommissionSalesParseResult {
  rows: CommissionSalesRawLine[];
  totalRows: number;
  validRows: number;
  discardedRows: number;
  periodFrom?: string;
  periodTo?: string;
  warnings: string[];
}

export interface CommissionReceivableRow {
  sourceRowIndex: number;
  documentNumber: string;
  balanceAmountCLP: number;
  clientCode?: string;
  clientName?: string;
  documentType?: string;
  dueDate?: string;
}

export interface CommissionReceivablesParseResult {
  rows: CommissionReceivableRow[];
  totalRows: number;
  validRows: number;
  discardedRows: number;
  warnings: string[];
}

export interface CommissionCarryoverLine {
  sourceRowIndex: number;
  sourceType: CommissionCarryoverSourceType;
  sourceCompanyKey?: CommissionCompanyKey | null;
  originPeriodKey: string;
  documentType: string;
  documentNumber: string;
  clientCode: string;
  clientName: string;
  salesRep: string;
  saleDate: string;
  productCode: string;
  productDescription: string;
  quantity: number;
  netAmountCLP: number;
  productClass?: string;
  ratePercent: number | null;
  sourceStatus?: string;
  observation?: string;
}

export interface CommissionCarryoverParseResult {
  rows: CommissionCarryoverLine[];
  totalRows: number;
  validRows: number;
  discardedRows: number;
  sourceType: CommissionCarryoverSourceType;
  warnings: string[];
}

export interface CommissionProcessedLine {
  lineOrder: number;
  companyKey: CommissionCompanyKey;
  periodKey: CommissionPeriodKey;
  originType: CommissionOriginType;
  originPeriodKey?: string;
  documentType: string;
  documentNumber: string;
  invoiceKey: string;
  clientCode: string;
  clientName: string;
  salesRep: string;
  saleDate: string;
  productCode: string;
  productDescription: string;
  quantity: number;
  netAmountCLP: number;
  productClass: CommissionProductClass | '';
  ratePercent: number;
  commissionAmountCLP: number;
  status: CommissionLineStatus;
  isNegative: boolean;
  isExcluded: boolean;
  exclusionReason?: string;
  warnings: string[];
  sourceFileName: string;
}

export interface CommissionClassSummary {
  currentPaidNetCLP: number;
  carryoverPaidNetCLP: number;
  negativeAdjustmentsNetCLP: number;
  baseNetCLP: number;
  totalCommissionCLP: number;
}

export interface CommissionSellerSummary {
  salesRep: string;
  currentPaidNetCLP: number;
  carryoverPaidNetCLP: number;
  negativeAdjustmentsNetCLP: number;
  totalBaseNetCLP: number;
  totalCommissionCLP: number;
  byClass: Partial<Record<CommissionProductClass, CommissionClassSummary>>;
}

export interface CommissionProcessingStats {
  paidCurrentInvoices: number;
  paidCarryoverInvoices: number;
  unpaidInvoices: number;
  excludedLines: number;
  affectedSellers: number;
  totalCommissionCLP: number;
}

export interface CommissionClosureSummary {
  companyKey: CommissionCompanyKey;
  companyLabel: string;
  periodKey: CommissionPeriodKey;
  generatedAt: string;
  salesFileName: string;
  receivablesFileName: string;
  carryoverFileName: string;
  configSnapshot: CommissionCompanyConfig;
  stats: CommissionProcessingStats;
  sellerSummaries: CommissionSellerSummary[];
  blockingErrors: string[];
  warnings: string[];
}

export interface CommissionClosureProcessingResult {
  companyKey: CommissionCompanyKey;
  companyLabel: string;
  periodKey: CommissionPeriodKey;
  salesFileName: string;
  receivablesFileName: string;
  carryoverFileName: string;
  usedCarryoverSource: 'manual' | 'saved' | 'none';
  configSnapshot: CommissionCompanyConfig;
  lines: CommissionProcessedLine[];
  currentPaidLines: CommissionProcessedLine[];
  carryoverPaidLines: CommissionProcessedLine[];
  unpaidLines: CommissionProcessedLine[];
  excludedLines: CommissionProcessedLine[];
  sellerSummaries: CommissionSellerSummary[];
  stats: CommissionProcessingStats;
  blockingErrors: string[];
  warnings: string[];
}

export interface CommissionWorkbookBuildResult {
  workbook: WorkBook;
  downloadFileName: string;
}

export interface CommissionClosureListItem {
  id: string;
  companyKey: CommissionCompanyKey;
  periodKey: CommissionPeriodKey;
  salesFileName: string;
  receivablesFileName: string;
  carryoverFileName: string;
  summary: CommissionClosureSummary;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionClosureRecord extends CommissionClosureListItem {
  lines: CommissionProcessedLine[];
}

export interface UpsertCommissionClosurePayload {
  companyKey: CommissionCompanyKey;
  periodKey: CommissionPeriodKey;
  salesFileName: string;
  receivablesFileName: string;
  carryoverFileName: string;
  summary: CommissionClosureSummary;
  lines: CommissionProcessedLine[];
}
