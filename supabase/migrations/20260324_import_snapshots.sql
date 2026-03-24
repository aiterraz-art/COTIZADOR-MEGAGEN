create table if not exists public.import_snapshots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_file text not null default '',
  currency text not null default 'USD',
  import_usd_rate numeric not null default 0,
  euro_rate numeric not null default 0,
  shipping_cost numeric not null default 0,
  shipping_currency text not null default 'CLP',
  customs_cost_clp numeric not null default 0,
  target_gross_margin_percent numeric not null default 0,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint import_snapshots_currency_check check (currency in ('USD', 'EUR')),
  constraint import_snapshots_shipping_currency_check check (shipping_currency in ('CLP', 'USD', 'EUR'))
);

create index if not exists idx_import_snapshots_created_at on public.import_snapshots (created_at desc);
