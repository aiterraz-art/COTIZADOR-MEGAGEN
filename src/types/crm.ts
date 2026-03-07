export interface CRMPeriodRow {
  documentName: string;
  documentNumber: string;
  salesRep: string;
  clientCode: string;
  clientName: string;
  saleDate: string;
  productCode: string;
  productDescription: string;
  quantity: number;
  unitPrice: number;
  totalDetail: number;
  currentCost: number;
}

export interface CRMClientAggregate {
  salesRep: string;
  clientCode: string;
  clientName: string;
  totalNetSales: number;
  recentSoldDate: string;
  status: 'Active' | 'Inactive';
  invoiceCount: number;
  transactionCount: number;
  monthlySales: Record<number, number>;
}

export interface CRMParseResult {
  rows: CRMPeriodRow[];
  totalRows: number;
  validRows: number;
  discardedRows: number;
  periodFrom?: string;
  periodTo?: string;
}
