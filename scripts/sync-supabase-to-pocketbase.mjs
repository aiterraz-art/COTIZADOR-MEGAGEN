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
    name: 'import_snapshots',
    fields: [
      { name: 'source_id', type: 'text' },
      { name: 'name', type: 'text', required: true },
      { name: 'source_file', type: 'text' },
      { name: 'currency', type: 'text' },
      { name: 'import_usd_rate', type: 'number' },
      { name: 'euro_rate', type: 'number' },
      { name: 'shipping_cost', type: 'number' },
      { name: 'shipping_currency', type: 'text' },
      { name: 'customs_cost_clp', type: 'number' },
      { name: 'target_gross_margin_percent', type: 'number' },
      { name: 'items', type: 'json' },
      { name: 'created_at', type: 'date' },
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
  {
    name: 'monthly_closures',
    fields: [
      { name: 'source_id', type: 'text' },
      { name: 'period_key', type: 'text', required: true },
      { name: 'balance_file_name', type: 'text' },
      { name: 'pnl_file_name', type: 'text' },
      { name: 'inventory_file_name', type: 'text' },
      { name: 'summary', type: 'json' },
      { name: 'created_at', type: 'date' },
      { name: 'updated_at', type: 'date' },
    ],
  },
  {
    name: 'monthly_balance_lines',
    fields: [
      { name: 'source_id', type: 'text' },
      { name: 'period_key', type: 'text', required: true },
      { name: 'line_order', type: 'number' },
      { name: 'account_code', type: 'text' },
      { name: 'account_name', type: 'text', required: true },
      { name: 'section', type: 'text' },
      { name: 'subsection', type: 'text' },
      { name: 'amount_clp', type: 'number' },
      { name: 'source_period_key', type: 'text' },
      { name: 'is_subtotal', type: 'bool' },
    ],
  },
  {
    name: 'monthly_pnl_lines',
    fields: [
      { name: 'source_id', type: 'text' },
      { name: 'period_key', type: 'text', required: true },
      { name: 'line_order', type: 'number' },
      { name: 'account_code', type: 'text' },
      { name: 'account_name', type: 'text', required: true },
      { name: 'section', type: 'text' },
      { name: 'subsection', type: 'text' },
      { name: 'amount_clp', type: 'number' },
      { name: 'source_period_key', type: 'text' },
      { name: 'is_subtotal', type: 'bool' },
    ],
  },
  {
    name: 'monthly_inventory_movements',
    fields: [
      { name: 'source_id', type: 'text' },
      { name: 'period_key', type: 'text', required: true },
      { name: 'sku', type: 'text', required: true },
      { name: 'product_name', type: 'text', required: true },
      { name: 'family', type: 'text' },
      { name: 'opening_qty', type: 'number' },
      { name: 'entries_qty', type: 'number' },
      { name: 'exits_qty', type: 'number' },
      { name: 'adjustments_qty', type: 'number' },
      { name: 'closing_qty', type: 'number' },
      { name: 'total_amount_clp', type: 'number' },
      { name: 'source_period_key', type: 'text' },
      { name: 'is_unclassified', type: 'bool' },
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
  const [
    products,
    simulations,
    importSnapshots,
    supplierMaster,
    rotation90d,
    weeklyStock,
    monthlyClosures,
    monthlyBalanceLines,
    monthlyPnlLines,
    monthlyInventoryMovements,
  ] = await Promise.all([
    fetchSupabaseRows('products'),
    fetchSupabaseRows('simulations'),
    fetchSupabaseRows('import_snapshots'),
    fetchSupabaseRows('inventory_supplier_master'),
    fetchSupabaseRows('inventory_rotation_90d'),
    fetchSupabaseRows('inventory_weekly_stock'),
    fetchSupabaseRows('monthly_closures'),
    fetchSupabaseRows('monthly_balance_lines'),
    fetchSupabaseRows('monthly_pnl_lines'),
    fetchSupabaseRows('monthly_inventory_movements'),
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
    'import_snapshots',
    importSnapshots.map((row) => ({
      source_id: String(row.id || ''),
      name: row.name || '',
      source_file: row.source_file || '',
      currency: row.currency || 'USD',
      import_usd_rate: toNumber(row.import_usd_rate),
      euro_rate: toNumber(row.euro_rate),
      shipping_cost: toNumber(row.shipping_cost),
      shipping_currency: row.shipping_currency || 'CLP',
      customs_cost_clp: toNumber(row.customs_cost_clp),
      target_gross_margin_percent: toNumber(row.target_gross_margin_percent),
      items: Array.isArray(row.items) ? row.items : [],
      created_at: row.created_at || null,
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

  await replaceCollectionData(
    'monthly_closures',
    monthlyClosures.map((row) => ({
      source_id: String(row.id || ''),
      period_key: row.period_key || '',
      balance_file_name: row.balance_file_name || '',
      pnl_file_name: row.pnl_file_name || '',
      inventory_file_name: row.inventory_file_name || '',
      summary: row.summary && typeof row.summary === 'object' ? row.summary : {},
      created_at: row.created_at || null,
      updated_at: row.updated_at || row.created_at || null,
    })),
  );

  await replaceCollectionData(
    'monthly_balance_lines',
    monthlyBalanceLines.map((row) => ({
      source_id: String(row.id || ''),
      period_key: row.period_key || '',
      line_order: toNumber(row.line_order),
      account_code: row.account_code || '',
      account_name: row.account_name || '',
      section: row.section || '',
      subsection: row.subsection || '',
      amount_clp: toNumber(row.amount_clp),
      source_period_key: row.source_period_key || '',
      is_subtotal: Boolean(row.is_subtotal),
    })),
  );

  await replaceCollectionData(
    'monthly_pnl_lines',
    monthlyPnlLines.map((row) => ({
      source_id: String(row.id || ''),
      period_key: row.period_key || '',
      line_order: toNumber(row.line_order),
      account_code: row.account_code || '',
      account_name: row.account_name || '',
      section: row.section || '',
      subsection: row.subsection || '',
      amount_clp: toNumber(row.amount_clp),
      source_period_key: row.source_period_key || '',
      is_subtotal: Boolean(row.is_subtotal),
    })),
  );

  await replaceCollectionData(
    'monthly_inventory_movements',
    monthlyInventoryMovements.map((row) => ({
      source_id: String(row.id || ''),
      period_key: row.period_key || '',
      sku: row.sku || '',
      product_name: row.product_name || '',
      family: row.family || 'SIN_CLASIFICAR',
      opening_qty: toNumber(row.opening_qty),
      entries_qty: toNumber(row.entries_qty),
      exits_qty: toNumber(row.exits_qty),
      adjustments_qty: toNumber(row.adjustments_qty),
      closing_qty: toNumber(row.closing_qty),
      total_amount_clp: row.total_amount_clp == null ? null : toNumber(row.total_amount_clp),
      source_period_key: row.source_period_key || '',
      is_unclassified: Boolean(row.is_unclassified),
    })),
  );

  console.log('\nDone. PocketBase now has a full copy of Supabase data.');
};

run().catch((error) => {
  console.error('\nSync failed:', error.message);
  process.exit(1);
});
