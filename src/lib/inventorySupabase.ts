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

const dedupeBySku = <T extends { sku: string }>(rows: T[]): T[] => {
  const map = new Map<string, T>();
  for (const row of rows) {
    map.set(normalizeSku(row.sku), { ...row, sku: normalizeSku(row.sku) });
  }
  return Array.from(map.values());
};

export const uploadSupplierMaster = async (rows: ProductSupplier[]): Promise<void> => {
  const deduped = dedupeBySku(rows);
  const payload: SupplierRow[] = deduped.map((row) => ({
    sku: row.sku,
    name: row.name,
    supplier_name: row.supplierName || 'SIN_PROVEEDOR',
    lead_time_days: row.leadTimeDays,
  }));

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
};

export const uploadRotation90d = async (rows: ProductRotation[]): Promise<void> => {
  const deduped = dedupeBySku(rows);
  const payload: RotationRow[] = deduped.map((row) => ({
    sku: row.sku,
    total_exits_90_days: row.totalExits90Days,
  }));

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
};

export const uploadWeeklyStock = async (rows: CurrentStock[]): Promise<void> => {
  const deduped = dedupeBySku(rows);
  const payload: StockRow[] = deduped.map((row) => ({
    sku: row.sku,
    stock_level: row.stockLevel,
    last_updated: row.lastUpdated,
  }));

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
};

export const fetchSupplierMaster = async (): Promise<ProductSupplier[]> => {
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
};

export const fetchRotation90d = async (): Promise<ProductRotation[]> => {
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
};

export const fetchWeeklyStock = async (): Promise<CurrentStock[]> => {
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
};
