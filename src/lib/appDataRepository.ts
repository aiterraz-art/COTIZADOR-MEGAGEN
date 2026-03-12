import type { Product } from '../data/mockProducts';
import { DATA_PROVIDER, DATA_PROVIDER_LABEL, isPocketBaseProvider } from './dataProvider';
import { pocketbase } from './pocketbase';
import { supabase } from './supabase';

export interface SimulationItemPayload {
  product_id?: string;
  name: string;
  qty: number;
  cost_usd: number;
  category?: string;
  pricing_mode?: string;
  pricing_value?: number | null;
  locked?: boolean;
  net_unit_clp?: number;
  net_total_clp?: number;
  profit_total_clp?: number;
  margin_percent?: number;
}

export interface SaveSimulationPayload {
  sale_price_clp: number;
  exchange_rate: number;
  total_cost_usd: number;
  total_cost_clp: number;
  margin_percent: number;
  net_profit_clp: number;
  pricing_mode?: string;
  target_margin_percent?: number | null;
  target_net_total_clp?: number | null;
  warnings?: string[];
  items: SimulationItemPayload[];
}

export interface SavedSimulationRecord {
  id: string;
  created_at: string;
  sale_price_clp: number;
  exchange_rate: number;
  total_cost_usd: number;
  total_cost_clp: number;
  margin_percent: number;
  net_profit_clp: number;
  pricing_mode?: string;
  target_margin_percent?: number | null;
  target_net_total_clp?: number | null;
  warnings?: string[];
  items: SimulationItemPayload[];
}

interface ProductRecord {
  id: string;
  sku?: string;
  name: string;
  category: string;
  cost_usd: number;
  msrp_usd?: number;
}

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toProduct = (record: ProductRecord): Product => ({
  id: record.id,
  sku: record.sku,
  name: record.name,
  category: record.category,
  costUSD: toNumber(record.cost_usd),
  suggestedPriceUSD: toNumber(record.msrp_usd),
});

const normalizeItems = (value: unknown): SimulationItemPayload[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      product_id: row.product_id ? String(row.product_id) : undefined,
      name: String(row.name || ''),
      qty: toNumber(row.qty),
      cost_usd: toNumber(row.cost_usd),
      category: row.category ? String(row.category) : undefined,
      pricing_mode: row.pricing_mode ? String(row.pricing_mode) : undefined,
      pricing_value: row.pricing_value == null ? null : toNumber(row.pricing_value),
      locked: Boolean(row.locked),
      net_unit_clp: row.net_unit_clp == null ? undefined : toNumber(row.net_unit_clp),
      net_total_clp: row.net_total_clp == null ? undefined : toNumber(row.net_total_clp),
      profit_total_clp: row.profit_total_clp == null ? undefined : toNumber(row.profit_total_clp),
      margin_percent: row.margin_percent == null ? undefined : toNumber(row.margin_percent),
    };
  });
};

const deleteAllPocketBaseRecords = async (collectionName: string): Promise<void> => {
  const rows = await pocketbase.collection(collectionName).getFullList<{ id: string }>({ fields: 'id' });
  for (const row of rows) {
    await pocketbase.collection(collectionName).delete(row.id);
  }
};

export const getDataBackendLabel = (): string => DATA_PROVIDER_LABEL;

export const fetchProductsList = async (): Promise<Product[]> => {
  if (!isPocketBaseProvider) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return (data || []).map((row) => toProduct(row as ProductRecord));
  }

  const data = await pocketbase.collection('products').getFullList<ProductRecord>({ sort: 'name' });
  return data.map((row) => toProduct(row));
};

export const replaceProductsCatalog = async (products: Product[]): Promise<void> => {
  const payload = products.map((p) => ({
    sku: p.sku,
    name: p.name,
    category: p.category,
    cost_usd: p.costUSD,
    msrp_usd: p.suggestedPriceUSD,
  }));

  if (!isPocketBaseProvider) {
    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteError) throw deleteError;

    if (!payload.length) return;

    const { error: insertError } = await supabase
      .from('products')
      .insert(payload);

    if (insertError) throw insertError;
    return;
  }

  await deleteAllPocketBaseRecords('products');
  for (const row of payload) {
    await pocketbase.collection('products').create(row);
  }
};

export const saveSimulationRecord = async (payload: SaveSimulationPayload): Promise<void> => {
  if (!isPocketBaseProvider) {
    const { error } = await supabase
      .from('simulations')
      .insert(payload);

    if (error) throw error;
    return;
  }

  await pocketbase.collection('simulations').create({
    ...payload,
    created_at: new Date().toISOString(),
  });
};

export const fetchSimulationRecords = async (): Promise<SavedSimulationRecord[]> => {
  if (!isPocketBaseProvider) {
    const { data, error } = await supabase
      .from('simulations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((row) => ({
      id: String((row as Record<string, unknown>).id || ''),
      created_at: String((row as Record<string, unknown>).created_at || ''),
      sale_price_clp: toNumber((row as Record<string, unknown>).sale_price_clp),
      exchange_rate: toNumber((row as Record<string, unknown>).exchange_rate),
      total_cost_usd: toNumber((row as Record<string, unknown>).total_cost_usd),
      total_cost_clp: toNumber((row as Record<string, unknown>).total_cost_clp),
      margin_percent: toNumber((row as Record<string, unknown>).margin_percent),
      net_profit_clp: toNumber((row as Record<string, unknown>).net_profit_clp),
      pricing_mode: (row as Record<string, unknown>).pricing_mode ? String((row as Record<string, unknown>).pricing_mode) : undefined,
      target_margin_percent: (row as Record<string, unknown>).target_margin_percent == null ? null : toNumber((row as Record<string, unknown>).target_margin_percent),
      target_net_total_clp: (row as Record<string, unknown>).target_net_total_clp == null ? null : toNumber((row as Record<string, unknown>).target_net_total_clp),
      warnings: Array.isArray((row as Record<string, unknown>).warnings)
        ? ((row as Record<string, unknown>).warnings as unknown[]).map((entry) => String(entry))
        : [],
      items: normalizeItems((row as Record<string, unknown>).items),
    }));
  }

  let rows: Record<string, unknown>[] = [];
  try {
    rows = await pocketbase.collection('simulations').getFullList<Record<string, unknown>>({ sort: '-created_at' });
  } catch {
    rows = await pocketbase.collection('simulations').getFullList<Record<string, unknown>>();
  }

  return rows.map((row) => ({
    id: String(row.id || ''),
    created_at: String(row.created_at || row.created || ''),
    sale_price_clp: toNumber(row.sale_price_clp),
    exchange_rate: toNumber(row.exchange_rate),
    total_cost_usd: toNumber(row.total_cost_usd),
    total_cost_clp: toNumber(row.total_cost_clp),
    margin_percent: toNumber(row.margin_percent),
    net_profit_clp: toNumber(row.net_profit_clp),
    pricing_mode: row.pricing_mode ? String(row.pricing_mode) : undefined,
    target_margin_percent: row.target_margin_percent == null ? null : toNumber(row.target_margin_percent),
    target_net_total_clp: row.target_net_total_clp == null ? null : toNumber(row.target_net_total_clp),
    warnings: Array.isArray(row.warnings) ? row.warnings.map((entry) => String(entry)) : [],
    items: normalizeItems(row.items),
  }));
};

export const deleteSimulationRecord = async (id: string): Promise<void> => {
  if (!isPocketBaseProvider) {
    const { error } = await supabase
      .from('simulations')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return;
  }

  await pocketbase.collection('simulations').delete(id);
};

export const deleteProductRecord = async (id: string): Promise<void> => {
  if (!isPocketBaseProvider) {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return;
  }

  await pocketbase.collection('products').delete(id);
};

export const createProductRecord = async (product: Omit<Product, 'id'>): Promise<Product> => {
  const payload = {
    name: product.name,
    cost_usd: product.costUSD,
    category: product.category,
    sku: product.sku,
    msrp_usd: product.suggestedPriceUSD,
  };

  if (!isPocketBaseProvider) {
    const { data, error } = await supabase
      .from('products')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return toProduct(data as ProductRecord);
  }

  const data = await pocketbase.collection('products').create<ProductRecord>(payload);
  return toProduct(data);
};

export const updateProductCategoryRecord = async (id: string, newCategory: string): Promise<void> => {
  if (!isPocketBaseProvider) {
    const { error } = await supabase
      .from('products')
      .update({ category: newCategory })
      .eq('id', id);

    if (error) throw error;
    return;
  }

  await pocketbase.collection('products').update(id, { category: newCategory });
};

export const currentDataProvider = (): 'supabase' | 'pocketbase' => DATA_PROVIDER;
