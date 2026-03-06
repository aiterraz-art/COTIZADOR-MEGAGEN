export interface ProductSupplier {
  sku: string;
  name: string;
  supplierName: string;
  leadTimeDays: number;
}

export interface ProductRotation {
  sku: string;
  totalExits90Days: number;
  averageDailyUsage: number;
}

export interface CurrentStock {
  sku: string;
  stockLevel: number;
  lastUpdated: string;
}

export type InventoryStatus = 'CRITICAL' | 'WARNING' | 'OK';

export interface InventoryCalculation {
  sku: string;
  name: string;
  supplierName: string;
  leadTimeDays: number;
  currentStock: number;
  totalExits90Days: number;
  averageDailyUsage: number;
  safetyStock: number;
  reorderPoint: number;
  suggestedOrderQuantity: number;
  status: InventoryStatus;
  coverageDays: number;
}

export interface InventorySettings {
  safetyDays: number;
  coverageDays: number;
}

export interface ParsedDatasetResult<T> {
  rows: T[];
  totalRows: number;
  validRows: number;
  discardedRows: number;
}

export interface DatasetUploadMeta {
  fileName: string;
  updatedAt: string;
  totalRows: number;
  validRows: number;
  discardedRows: number;
}

export interface InventoryUploadMetadata {
  suppliers?: DatasetUploadMeta;
  rotation?: DatasetUploadMeta;
  stock?: DatasetUploadMeta;
}
