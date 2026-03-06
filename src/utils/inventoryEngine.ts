import type {
  CurrentStock,
  InventoryCalculation,
  InventorySettings,
  InventoryStatus,
  ProductRotation,
  ProductSupplier,
} from '../types/inventory';

const DAYS_IN_90D_WINDOW = 90;

const round2 = (value: number): number => Math.round(value * 100) / 100;

export const calculateAverageDailyUsage = (totalExits90Days: number): number => {
  if (!Number.isFinite(totalExits90Days) || totalExits90Days <= 0) return 0;
  return round2(totalExits90Days / DAYS_IN_90D_WINDOW);
};

export const calculateSafetyStock = (averageDailyUsage: number, safetyDays: number): number => {
  if (averageDailyUsage <= 0 || safetyDays <= 0) return 0;
  return round2(averageDailyUsage * safetyDays);
};

export const calculateReorderPoint = (
  averageDailyUsage: number,
  leadTimeDays: number,
  safetyStock: number,
): number => {
  return round2((averageDailyUsage * Math.max(0, leadTimeDays)) + safetyStock);
};

export const calculateSuggestedOrderQuantity = (
  reorderPoint: number,
  currentStock: number,
  averageDailyUsage: number,
  coverageDays: number,
): number => {
  const rawValue = reorderPoint - currentStock + (averageDailyUsage * Math.max(0, coverageDays));
  return round2(Math.max(0, rawValue));
};

export const resolveInventoryStatus = (
  currentStock: number,
  reorderPoint: number,
): InventoryStatus => {
  if (currentStock <= 0) return 'CRITICAL';
  if (currentStock <= reorderPoint) return 'WARNING';
  return 'OK';
};

const statusPriority: Record<InventoryStatus, number> = {
  CRITICAL: 0,
  WARNING: 1,
  OK: 2,
};

const normalizeSku = (value: string): string => value.trim().toUpperCase();

export const buildInventoryCalculations = (
  suppliers: ProductSupplier[],
  rotations: ProductRotation[],
  stocks: CurrentStock[],
  settings: InventorySettings,
): InventoryCalculation[] => {
  const rotationBySku = new Map<string, ProductRotation>();
  const stockBySku = new Map<string, CurrentStock>();

  for (const rotation of rotations) {
    rotationBySku.set(normalizeSku(rotation.sku), rotation);
  }

  for (const stock of stocks) {
    stockBySku.set(normalizeSku(stock.sku), stock);
  }

  const calculations = suppliers.map((supplier): InventoryCalculation => {
    const skuKey = normalizeSku(supplier.sku);
    const rotation = rotationBySku.get(skuKey);
    const stock = stockBySku.get(skuKey);

    const totalExits90Days = rotation?.totalExits90Days ?? 0;
    const averageDailyUsage = calculateAverageDailyUsage(totalExits90Days);
    const safetyStock = calculateSafetyStock(averageDailyUsage, settings.safetyDays);
    const reorderPoint = calculateReorderPoint(averageDailyUsage, supplier.leadTimeDays, safetyStock);
    const currentStock = stock?.stockLevel ?? 0;
    const suggestedOrderQuantity = calculateSuggestedOrderQuantity(
      reorderPoint,
      currentStock,
      averageDailyUsage,
      settings.coverageDays,
    );
    const status = resolveInventoryStatus(currentStock, reorderPoint);

    return {
      sku: supplier.sku,
      name: supplier.name,
      supplierName: supplier.supplierName || 'SIN_PROVEEDOR',
      leadTimeDays: supplier.leadTimeDays,
      currentStock,
      totalExits90Days,
      averageDailyUsage,
      safetyStock,
      reorderPoint,
      suggestedOrderQuantity,
      status,
      coverageDays: settings.coverageDays,
    };
  });

  calculations.sort((a, b) => {
    const byStatus = statusPriority[a.status] - statusPriority[b.status];
    if (byStatus !== 0) return byStatus;

    const aCoverage = a.averageDailyUsage > 0 ? a.currentStock / a.averageDailyUsage : Number.POSITIVE_INFINITY;
    const bCoverage = b.averageDailyUsage > 0 ? b.currentStock / b.averageDailyUsage : Number.POSITIVE_INFINITY;
    if (aCoverage !== bCoverage) return aCoverage - bCoverage;

    return a.sku.localeCompare(b.sku, 'es');
  });

  return calculations;
};
