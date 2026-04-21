create table if not exists public.commission_company_configs (
  id uuid primary key default gen_random_uuid(),
  company_key text not null,
  global_rate_percent numeric null,
  implant_rate_percent numeric null,
  three_dental_rate_percent numeric null,
  exclusion_rules jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commission_company_configs_company_key_unique unique (company_key),
  constraint commission_company_configs_company_key_check check (company_key in ('megagen', '3dental'))
);

create table if not exists public.commission_closures (
  id uuid primary key default gen_random_uuid(),
  company_key text not null,
  period_key text not null,
  sales_file_name text not null default '',
  receivables_file_name text not null default '',
  carryover_file_name text not null default '',
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commission_closures_company_period_unique unique (company_key, period_key),
  constraint commission_closures_company_key_check check (company_key in ('megagen', '3dental'))
);

create table if not exists public.commission_closure_lines (
  id uuid primary key default gen_random_uuid(),
  company_key text not null,
  period_key text not null,
  line_order integer not null default 0,
  origin_type text not null,
  origin_period_key text null,
  document_type text not null default '',
  document_number text not null default '',
  client_code text not null default '',
  client_name text not null default '',
  sales_rep text not null default '',
  sale_date date null,
  product_code text not null default '',
  product_description text not null default '',
  quantity numeric not null default 0,
  net_amount_clp numeric not null default 0,
  product_class text not null default '',
  rate_percent numeric not null default 0,
  commission_amount_clp numeric not null default 0,
  status text not null,
  exclusion_reason text not null default '',
  warnings jsonb not null default '[]'::jsonb,
  source_file_name text not null default '',
  is_negative boolean not null default false,
  is_excluded boolean not null default false,
  created_at timestamptz not null default now(),
  constraint commission_closure_lines_company_key_check check (company_key in ('megagen', '3dental')),
  constraint commission_closure_lines_origin_type_check check (origin_type in ('current_sales', 'carryover_saved', 'carryover_file', 'bootstrap')),
  constraint commission_closure_lines_status_check check (status in ('paid_current', 'paid_carryover', 'unpaid', 'excluded'))
);

create index if not exists idx_commission_company_configs_company_key on public.commission_company_configs (company_key);
create index if not exists idx_commission_closures_company_period on public.commission_closures (company_key, period_key desc);
create index if not exists idx_commission_closure_lines_company_period on public.commission_closure_lines (company_key, period_key, line_order);
create index if not exists idx_commission_closure_lines_invoice on public.commission_closure_lines (company_key, document_number);
