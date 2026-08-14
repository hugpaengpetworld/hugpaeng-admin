set search_path = public, extensions;

create type public.migration_run_status as enum (
  'VALIDATING', 'VALIDATED', 'STAGED', 'APPLIED', 'FAILED', 'ROLLED_BACK'
);

create table public.migration_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  source_system text not null default 'BMP_BOOKING_GAS_V1_8_3',
  source_version text not null,
  export_timestamp timestamptz,
  input_checksum text not null check (input_checksum ~ '^[a-f0-9]{64}$'),
  strategy text not null check (strategy in ('CLEAN_SEED', 'LEGACY_IMPORT')),
  status public.migration_run_status not null default 'VALIDATING',
  source_manifest jsonb not null default '{}'::jsonb,
  reconciliation_summary jsonb not null default '{}'::jsonb,
  exception_count integer not null default 0 check (exception_count >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (tenant_id, input_checksum, strategy)
);

create table public.migration_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  migration_run_id uuid not null references public.migration_runs(id) on delete cascade,
  source_name text not null,
  source_row_number integer check (source_row_number is null or source_row_number > 1),
  entity_type text,
  legacy_id text,
  error_code text not null,
  safe_message text not null,
  safe_details jsonb not null default '{}'::jsonb,
  disposition text,
  resolved_by uuid references public.profiles(user_id) on delete restrict,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint migration_exception_resolution_consistent check (
    (resolved_at is null and resolved_by is null)
    or (resolved_at is not null and resolved_by is not null and disposition is not null)
  )
);

create table public.migration_id_maps (
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  migration_run_id uuid not null references public.migration_runs(id) on delete cascade,
  entity_type text not null,
  legacy_id text not null,
  target_id uuid not null,
  target_code text,
  created_at timestamptz not null default now(),
  primary key (migration_run_id, entity_type, legacy_id),
  unique (tenant_id, entity_type, target_id)
);

create index migration_runs_tenant_created_idx
  on public.migration_runs (tenant_id, created_at desc);
create index migration_exceptions_run_code_idx
  on public.migration_exceptions (migration_run_id, error_code);

alter table public.migration_runs enable row level security;
alter table public.migration_exceptions enable row level security;
alter table public.migration_id_maps enable row level security;

create policy migration_runs_select_owner
on public.migration_runs
for select to authenticated
using (public.has_tenant_role(tenant_id, array['OWNER']::public.clinic_role[]));
create policy migration_exceptions_select_owner
on public.migration_exceptions
for select to authenticated
using (public.has_tenant_role(tenant_id, array['OWNER']::public.clinic_role[]));
create policy migration_id_maps_select_owner
on public.migration_id_maps
for select to authenticated
using (public.has_tenant_role(tenant_id, array['OWNER']::public.clinic_role[]));

comment on table public.migration_runs is
  'Repeatable migration rehearsal facts keyed by tenant, SHA-256 input checksum, and chosen strategy.';
comment on table public.migration_exceptions is
  'Safe exception metadata only; do not copy full customer rows or credentials into this table.';
