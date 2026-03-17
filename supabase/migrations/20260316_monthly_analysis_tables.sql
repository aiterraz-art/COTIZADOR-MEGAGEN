create table if not exists public.monthly_closures (
  id uuid primary key default gen_random_uuid(),
  period_key text not null,
  balance_file_name text not null,
  pnl_file_name text not null,
  inventory_file_name text not null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_closures_period_key_unique unique (period_key)
);

create table if not exists public.monthly_balance_lines (
  id uuid primary key default gen_random_uuid(),
  period_key text not null,
  line_order integer not null default 0,
  account_code text not null default '',
  account_name text not null,
  section text not null,
  subsection text not null default '',
  amount_clp numeric not null default 0,
  source_period_key text null,
  is_subtotal boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.monthly_pnl_lines (
  id uuid primary key default gen_random_uuid(),
  period_key text not null,
  line_order integer not null default 0,
  account_code text not null default '',
  account_name text not null,
  section text not null,
  subsection text not null default '',
  amount_clp numeric not null default 0,
  source_period_key text null,
  is_subtotal boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.monthly_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  period_key text not null,
  sku text not null,
  product_name text not null,
  family text not null,
  opening_qty numeric not null default 0,
  entries_qty numeric not null default 0,
  exits_qty numeric not null default 0,
  adjustments_qty numeric not null default 0,
  closing_qty numeric not null default 0,
  total_amount_clp numeric null,
  source_period_key text null,
  is_unclassified boolean not null default false,
  created_at timestamptz not null default now(),
  constraint monthly_inventory_movements_family_check check (family in ('IMPLANTES', 'ADITAMENTOS', 'KITS', 'SIN_CLASIFICAR'))
);

create index if not exists idx_monthly_closures_period_key on public.monthly_closures (period_key);
create index if not exists idx_monthly_balance_lines_period_key on public.monthly_balance_lines (period_key);
create index if not exists idx_monthly_balance_lines_period_order on public.monthly_balance_lines (period_key, line_order);
create index if not exists idx_monthly_pnl_lines_period_key on public.monthly_pnl_lines (period_key);
create index if not exists idx_monthly_pnl_lines_period_order on public.monthly_pnl_lines (period_key, line_order);
create index if not exists idx_monthly_inventory_movements_period_key on public.monthly_inventory_movements (period_key);
create index if not exists idx_monthly_inventory_movements_period_sku on public.monthly_inventory_movements (period_key, sku);
