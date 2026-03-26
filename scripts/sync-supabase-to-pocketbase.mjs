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
  {
    name: 'commission_company_configs',
    fields: [
      { name: 'source_id', type: 'text' },
      { name: 'company_key', type: 'text', required: true },
      { name: 'global_rate_percent', type: 'number' },
      { name: 'implant_rate_percent', type: 'number' },
      { name: 'three_dental_rate_percent', type: 'number' },
      { name: 'exclusion_rules', type: 'json' },
      { name: 'created_at', type: 'date' },
      { name: 'updated_at', type: 'date' },
    ],
  },
  {
    name: 'commission_closures',
    fields: [
      { name: 'source_id', type: 'text' },
      { name: 'company_key', type: 'text', required: true },
      { name: 'period_key', type: 'text', required: true },
      { name: 'sales_file_name', type: 'text' },
      { name: 'receivables_file_name', type: 'text' },
      { name: 'carryover_file_name', type: 'text' },
      { name: 'summary', type: 'json' },
      { name: 'created_at', type: 'date' },
      { name: 'updated_at', type: 'date' },
    ],
  },
  {
    name: 'commission_closure_lines',
    fields: [
      { name: 'source_id', type: 'text' },
      { name: 'company_key', type: 'text', required: true },
      { name: 'period_key', type: 'text', required: true },
      { name: 'line_order', type: 'number' },
      { name: 'origin_type', type: 'text' },
      { name: 'origin_period_key', type: 'text' },
      { name: 'document_type', type: 'text' },
      { name: 'document_number', type: 'text' },
      { name: 'client_code', type: 'text' },
      { name: 'client_name', type: 'text' },
      { name: 'sales_rep', type: 'text' },
      { name: 'sale_date', type: 'date' },
      { name: 'product_code', type: 'text' },
      { name: 'product_description', type: 'text' },
      { name: 'quantity', type: 'number' },
      { name: 'net_amount_clp', type: 'number' },
      { name: 'product_class', type: 'text' },
      { name: 'rate_percent', type: 'number' },
      { name: 'commission_amount_clp', type: 'number' },
      { name: 'status', type: 'text' },
      { name: 'exclusion_reason', type: 'text' },
      { name: 'warnings', type: 'json' },
      { name: 'source_file_name', type: 'text' },
      { name: 'is_negative', type: 'bool' },
      { name: 'is_excluded', type: 'bool' },
      { name: 'created_at', type: 'date' },
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
    commissionCompanyConfigs,
    commissionClosures,
    commissionClosureLines,
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
    fetchSupabaseRows('commission_company_configs'),
    fetchSupabaseRows('commission_closures'),
    fetchSupabaseRows('commission_closure_lines'),
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

  await replaceCollectionData(
    'commission_company_configs',
    commissionCompanyConfigs.map((row) => ({
      source_id: String(row.id || ''),
      company_key: row.company_key || '',
      global_rate_percent: row.global_rate_percent == null ? null : toNumber(row.global_rate_percent),
      implant_rate_percent: row.implant_rate_percent == null ? null : toNumber(row.implant_rate_percent),
      three_dental_rate_percent: row.three_dental_rate_percent == null ? null : toNumber(row.three_dental_rate_percent),
      exclusion_rules: Array.isArray(row.exclusion_rules) ? row.exclusion_rules : [],
      created_at: row.created_at || null,
      updated_at: row.updated_at || row.created_at || null,
    })),
  );

  await replaceCollectionData(
    'commission_closures',
    commissionClosures.map((row) => ({
      source_id: String(row.id || ''),
      company_key: row.company_key || '',
      period_key: row.period_key || '',
      sales_file_name: row.sales_file_name || '',
      receivables_file_name: row.receivables_file_name || '',
      carryover_file_name: row.carryover_file_name || '',
      summary: row.summary && typeof row.summary === 'object' ? row.summary : {},
      created_at: row.created_at || null,
      updated_at: row.updated_at || row.created_at || null,
    })),
  );

  await replaceCollectionData(
    'commission_closure_lines',
    commissionClosureLines.map((row) => ({
      source_id: String(row.id || ''),
      company_key: row.company_key || '',
      period_key: row.period_key || '',
      line_order: toNumber(row.line_order),
      origin_type: row.origin_type || '',
      origin_period_key: row.origin_period_key || '',
      document_type: row.document_type || '',
      document_number: row.document_number || '',
      client_code: row.client_code || '',
      client_name: row.client_name || '',
      sales_rep: row.sales_rep || '',
      sale_date: row.sale_date || null,
      product_code: row.product_code || '',
      product_description: row.product_description || '',
      quantity: toNumber(row.quantity),
      net_amount_clp: toNumber(row.net_amount_clp),
      product_class: row.product_class || '',
      rate_percent: toNumber(row.rate_percent),
      commission_amount_clp: toNumber(row.commission_amount_clp),
      status: row.status || '',
      exclusion_reason: row.exclusion_reason || '',
      warnings: Array.isArray(row.warnings) ? row.warnings : [],
      source_file_name: row.source_file_name || '',
      is_negative: Boolean(row.is_negative),
      is_excluded: Boolean(row.is_excluded),
      created_at: row.created_at || null,
    })),
  );

  console.log('\nDone. PocketBase now has a full copy of Supabase data.');
};

run().catch((error) => {
  console.error('\nSync failed:', error.message);
  process.exit(1);
});
