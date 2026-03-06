-- Inventory module base schema (single-tenant, org_id nullable for future multi-tenant).

create table if not exists public.inventory_supplier_master (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  name text not null,
  supplier_name text not null,
  lead_time_days numeric not null default 0,
  org_id text null,
  updated_at timestamptz not null default now(),
  constraint inventory_supplier_master_lead_time_days_check check (lead_time_days >= 0)
);

create table if not exists public.inventory_rotation_90d (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  total_exits_90_days numeric not null default 0,
  org_id text null,
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_weekly_stock (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  stock_level numeric not null default 0,
  last_updated date not null,
  org_id text null,
  updated_at timestamptz not null default now(),
  constraint inventory_weekly_stock_stock_level_check check (stock_level >= 0)
);

create index if not exists idx_inventory_supplier_master_sku on public.inventory_supplier_master (sku);
create index if not exists idx_inventory_rotation_90d_sku on public.inventory_rotation_90d (sku);
create index if not exists idx_inventory_weekly_stock_sku on public.inventory_weekly_stock (sku);

-- Future multi-tenant indexes.
create index if not exists idx_inventory_supplier_master_org_sku on public.inventory_supplier_master (org_id, sku);
create index if not exists idx_inventory_rotation_90d_org_sku on public.inventory_rotation_90d (org_id, sku);
create index if not exists idx_inventory_weekly_stock_org_sku on public.inventory_weekly_stock (org_id, sku);
