import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import PocketBase from 'pocketbase';

const readEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  return '';
};

const supabaseUrl = readEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
const pocketbaseUrl = readEnv('POCKETBASE_URL', 'VITE_POCKETBASE_URL');
const pocketbaseAdminEmail = readEnv('POCKETBASE_ADMIN_EMAIL', 'VITE_POCKETBASE_ADMIN_EMAIL');
const pocketbaseAdminPassword = readEnv('POCKETBASE_ADMIN_PASSWORD', 'VITE_POCKETBASE_ADMIN_PASSWORD');
const supabaseKey = readEnv('SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_ANON_KEY');

if (!supabaseUrl) {
  throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL');
}
if (!pocketbaseUrl) {
  throw new Error('Missing POCKETBASE_URL or VITE_POCKETBASE_URL');
}
if (!pocketbaseAdminEmail) {
  throw new Error('Missing POCKETBASE_ADMIN_EMAIL or VITE_POCKETBASE_ADMIN_EMAIL');
}
if (!pocketbaseAdminPassword) {
  throw new Error('Missing POCKETBASE_ADMIN_PASSWORD or VITE_POCKETBASE_ADMIN_PASSWORD');
}

if (!supabaseKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (recommended) or VITE_SUPABASE_ANON_KEY');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const pocketbase = new PocketBase(pocketbaseUrl);
pocketbase.autoCancellation(false);

const openRulesPatch = {
  listRule: '',
  viewRule: '',
  createRule: '',
  updateRule: '',
  deleteRule: '',
};

const collectionDefinitions = [
  {
    name: 'products',
    fields: [
      { name: 'source_id', type: 'text' },
      { name: 'sku', type: 'text' },
      { name: 'name', type: 'text', required: true },
      { name: 'category', type: 'text' },
      { name: 'cost_usd', type: 'number' },
      { name: 'msrp_usd', type: 'number' },
    ],
  },
  {
    name: 'simulations',
    fields: [
      { name: 'source_id', type: 'text' },
      { name: 'created_at', type: 'date' },
      { name: 'sale_price_clp', type: 'number' },
      { name: 'exchange_rate', type: 'number' },
      { name: 'total_cost_usd', type: 'number' },
      { name: 'total_cost_clp', type: 'number' },
      { name: 'margin_percent', type: 'number' },
      { name: 'net_profit_clp', type: 'number' },
      { name: 'items', type: 'json' },
    ],
  },
  {
    name: 'inventory_supplier_master',
    fields: [
      { name: 'source_id', type: 'text' },
      { name: 'sku', type: 'text', required: true },
      { name: 'name', type: 'text', required: true },
      { name: 'supplier_name', type: 'text' },
      { name: 'lead_time_days', type: 'number' },
    ],
  },
  {
    name: 'inventory_rotation_90d',
    fields: [
      { name: 'source_id', type: 'text' },
      { name: 'sku', type: 'text', required: true },
      { name: 'total_exits_90_days', type: 'number' },
    ],
  },
  {
    name: 'inventory_weekly_stock',
    fields: [
      { name: 'source_id', type: 'text' },
      { name: 'sku', type: 'text', required: true },
      { name: 'stock_level', type: 'number' },
      { name: 'last_updated', type: 'date' },
    ],
  },
];

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const ensureCollections = async () => {
  const existing = await pocketbase.collections.getFullList();

  for (const def of collectionDefinitions) {
    const match = existing.find((item) => item.name === def.name);

    if (!match) {
      await pocketbase.collections.create({
        name: def.name,
        type: 'base',
        fields: def.fields,
        ...openRulesPatch,
      });
      console.log(`+ created collection: ${def.name}`);
      continue;
    }

    await pocketbase.collections.update(match.id, {
      fields: def.fields,
      ...openRulesPatch,
    });
    console.log(`= collection ready: ${def.name}`);
  }
};

const fetchSupabaseRows = async (tableName) => {
  const { data, error } = await supabase.from(tableName).select('*');
  if (error) throw new Error(`Supabase fetch failed (${tableName}): ${error.message}`);
  return data || [];
};

const deleteAllRecords = async (collectionName) => {
  const records = await pocketbase.collection(collectionName).getFullList({ fields: 'id' });
  for (const record of records) {
    await pocketbase.collection(collectionName).delete(record.id);
  }
};

const replaceCollectionData = async (collectionName, rows) => {
  await deleteAllRecords(collectionName);
  for (const row of rows) {
    await pocketbase.collection(collectionName).create(row);
  }
  console.log(`✓ ${collectionName}: ${rows.length} records`);
};

const run = async () => {
  console.log('Authenticating PocketBase admin...');
  await pocketbase.collection('_superusers').authWithPassword(
    pocketbaseAdminEmail,
    pocketbaseAdminPassword,
  );

  console.log('Ensuring collections...');
  await ensureCollections();

  console.log('Reading data from Supabase...');
  const [products, simulations, supplierMaster, rotation90d, weeklyStock] = await Promise.all([
    fetchSupabaseRows('products'),
    fetchSupabaseRows('simulations'),
    fetchSupabaseRows('inventory_supplier_master'),
    fetchSupabaseRows('inventory_rotation_90d'),
    fetchSupabaseRows('inventory_weekly_stock'),
  ]);

  console.log('Copying data into PocketBase...');

  await replaceCollectionData(
    'products',
    products.map((row) => ({
      source_id: String(row.id || ''),
      sku: row.sku || '',
      name: row.name || '',
      category: row.category || 'General',
      cost_usd: toNumber(row.cost_usd),
      msrp_usd: toNumber(row.msrp_usd),
    })),
  );

  await replaceCollectionData(
    'simulations',
    simulations.map((row) => ({
      source_id: String(row.id || ''),
      created_at: row.created_at || null,
      sale_price_clp: toNumber(row.sale_price_clp),
      exchange_rate: toNumber(row.exchange_rate),
      total_cost_usd: toNumber(row.total_cost_usd),
      total_cost_clp: toNumber(row.total_cost_clp),
      margin_percent: toNumber(row.margin_percent),
      net_profit_clp: toNumber(row.net_profit_clp),
      items: Array.isArray(row.items) ? row.items : [],
    })),
  );

  await replaceCollectionData(
    'inventory_supplier_master',
    supplierMaster.map((row) => ({
      source_id: String(row.id || ''),
      sku: row.sku || '',
      name: row.name || '',
      supplier_name: row.supplier_name || 'SIN_PROVEEDOR',
      lead_time_days: toNumber(row.lead_time_days),
    })),
  );

  await replaceCollectionData(
    'inventory_rotation_90d',
    rotation90d.map((row) => ({
      source_id: String(row.id || ''),
      sku: row.sku || '',
      total_exits_90_days: toNumber(row.total_exits_90_days),
    })),
  );

  await replaceCollectionData(
    'inventory_weekly_stock',
    weeklyStock.map((row) => ({
      source_id: String(row.id || ''),
      sku: row.sku || '',
      stock_level: toNumber(row.stock_level),
      last_updated: row.last_updated || null,
    })),
  );

  console.log('\nDone. PocketBase now has a full copy of Supabase data.');
};

run().catch((error) => {
  console.error('\nSync failed:', error.message);
  process.exit(1);
});
