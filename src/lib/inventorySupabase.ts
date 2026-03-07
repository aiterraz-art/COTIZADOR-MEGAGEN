import { isPocketBaseProvider } from './dataProvider';
import { pocketbase } from './pocketbase';
import { supabase } from './supabase';
import type { CurrentStock, ProductRotation, ProductSupplier } from '../types/inventory';

interface SupplierRow {
  sku: string;
  name: string;
  supplier_name: string;
  lead_time_days: number;
}

interface RotationRow {
  sku: string;
  total_exits_90_days: number;
}

interface StockRow {
  sku: string;
  stock_level: number;
  last_updated: string;
}

const normalizeSku = (value: string): string => value.trim().toUpperCase();

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const dedupeBySku = <T extends { sku: string }>(rows: T[]): T[] => {
  const map = new Map<string, T>();
  for (const row of rows) {
    map.set(normalizeSku(row.sku), { ...row, sku: normalizeSku(row.sku) });
  }
  return Array.from(map.values());
};

const deleteAllPocketBaseRecords = async (collectionName: string): Promise<void> => {
  const rows = await pocketbase.collection(collectionName).getFullList<{ id: string }>({ fields: 'id' });
  for (const row of rows) {
    await pocketbase.collection(collectionName).delete(row.id);
  }
};

export const uploadSupplierMaster = async (rows: ProductSupplier[]): Promise<void> => {
  const deduped = dedupeBySku(rows);
  const payload: SupplierRow[] = deduped.map((row) => ({
    sku: row.sku,
    name: row.name,
    supplier_name: row.supplierName || 'SIN_PROVEEDOR',
    lead_time_days: row.leadTimeDays,
  }));

  if (!isPocketBaseProvider) {
    const { error: deleteError } = await supabase
      .from('inventory_supplier_master')
      .delete()
      .neq('sku', '__NO_ROWS__');

    if (deleteError) throw deleteError;

    if (!payload.length) return;

    const { error: insertError } = await supabase
      .from('inventory_supplier_master')
      .insert(payload);

    if (insertError) throw insertError;
    return;
  }

  await deleteAllPocketBaseRecords('inventory_supplier_master');
  for (const row of payload) {
    await pocketbase.collection('inventory_supplier_master').create(row);
  }
};

export const uploadRotation90d = async (rows: ProductRotation[]): Promise<void> => {
  const deduped = dedupeBySku(rows);
  const payload: RotationRow[] = deduped.map((row) => ({
    sku: row.sku,
    total_exits_90_days: row.totalExits90Days,
  }));

  if (!isPocketBaseProvider) {
    const { error: deleteError } = await supabase
      .from('inventory_rotation_90d')
      .delete()
      .neq('sku', '__NO_ROWS__');

    if (deleteError) throw deleteError;

    if (!payload.length) return;

    const { error: insertError } = await supabase
      .from('inventory_rotation_90d')
      .insert(payload);

    if (insertError) throw insertError;
    return;
  }

  await deleteAllPocketBaseRecords('inventory_rotation_90d');
  for (const row of payload) {
    await pocketbase.collection('inventory_rotation_90d').create(row);
  }
};

export const uploadWeeklyStock = async (rows: CurrentStock[]): Promise<void> => {
  const deduped = dedupeBySku(rows);
  const payload: StockRow[] = deduped.map((row) => ({
    sku: row.sku,
    stock_level: row.stockLevel,
    last_updated: row.lastUpdated,
  }));

  if (!isPocketBaseProvider) {
    const { error: deleteError } = await supabase
      .from('inventory_weekly_stock')
      .delete()
      .neq('sku', '__NO_ROWS__');

    if (deleteError) throw deleteError;

    if (!payload.length) return;

    const { error: insertError } = await supabase
      .from('inventory_weekly_stock')
      .insert(payload);

    if (insertError) throw insertError;
    return;
  }

  await deleteAllPocketBaseRecords('inventory_weekly_stock');
  for (const row of payload) {
    await pocketbase.collection('inventory_weekly_stock').create(row);
  }
};

export const fetchSupplierMaster = async (): Promise<ProductSupplier[]> => {
  if (!isPocketBaseProvider) {
    const { data, error } = await supabase
      .from('inventory_supplier_master')
      .select('sku, name, supplier_name, lead_time_days')
      .order('sku', { ascending: true });

    if (error) throw error;

    return (data ?? []).map((row) => ({
      sku: normalizeSku(row.sku),
      name: row.name,
      supplierName: row.supplier_name,
      leadTimeDays: Number(row.lead_time_days ?? 0),
    }));
  }

  const data = await pocketbase.collection('inventory_supplier_master').getFullList<Record<string, unknown>>({ sort: 'sku' });

  return data.map((row) => ({
    sku: normalizeSku(String(row.sku || '')),
    name: String(row.name || ''),
    supplierName: String(row.supplier_name || 'SIN_PROVEEDOR'),
    leadTimeDays: toNumber(row.lead_time_days),
  }));
};

export const fetchRotation90d = async (): Promise<ProductRotation[]> => {
  if (!isPocketBaseProvider) {
    const { data, error } = await supabase
      .from('inventory_rotation_90d')
      .select('sku, total_exits_90_days')
      .order('sku', { ascending: true });

    if (error) throw error;

    return (data ?? []).map((row) => {
      const totalExits90Days = Number(row.total_exits_90_days ?? 0);
      return {
        sku: normalizeSku(row.sku),
        totalExits90Days,
        averageDailyUsage: totalExits90Days / 90,
      };
    });
  }

  const data = await pocketbase.collection('inventory_rotation_90d').getFullList<Record<string, unknown>>({ sort: 'sku' });

  return data.map((row) => {
    const totalExits90Days = toNumber(row.total_exits_90_days);
    return {
      sku: normalizeSku(String(row.sku || '')),
      totalExits90Days,
      averageDailyUsage: totalExits90Days / 90,
    };
  });
};

export const fetchWeeklyStock = async (): Promise<CurrentStock[]> => {
  if (!isPocketBaseProvider) {
    const { data, error } = await supabase
      .from('inventory_weekly_stock')
      .select('sku, stock_level, last_updated')
      .order('sku', { ascending: true });

    if (error) throw error;

    return (data ?? []).map((row) => ({
      sku: normalizeSku(row.sku),
      stockLevel: Number(row.stock_level ?? 0),
      lastUpdated: row.last_updated ?? new Date().toISOString().slice(0, 10),
    }));
  }

  const data = await pocketbase.collection('inventory_weekly_stock').getFullList<Record<string, unknown>>({ sort: 'sku' });

  return data.map((row) => ({
    sku: normalizeSku(String(row.sku || '')),
    stockLevel: toNumber(row.stock_level),
    lastUpdated: String(row.last_updated || row.created || new Date().toISOString().slice(0, 10)),
  }));
};
