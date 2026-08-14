set search_path = public, extensions;

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  thai_name text not null check (char_length(thai_name) between 1 and 200),
  english_name text not null check (char_length(english_name) between 1 and 200),
  timezone text not null default 'Asia/Bangkok',
  currency char(3) not null default 'THB',
  status public.tenant_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_timezone_supported check (timezone = 'Asia/Bangkok'),
  constraint tenants_currency_supported check (currency = 'THB')
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 150),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role public.clinic_role not null,
  status public.membership_status not null default 'INVITED',
  invited_at timestamptz not null default now(),
  activated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id),
  unique (tenant_id, id),
  constraint membership_activation_consistent check (
    (status = 'ACTIVE' and activated_at is not null and revoked_at is null)
    or (status <> 'ACTIVE')
  ),
  constraint membership_revocation_consistent check (
    (status = 'REVOKED' and revoked_at is not null)
    or (status <> 'REVOKED' and revoked_at is null)
  )
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 200),
  phone text not null check (phone ~ '^\+?[0-9]{8,15}$'),
  line_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create index customers_tenant_phone_idx on public.customers (tenant_id, phone);

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null,
  name text not null check (char_length(name) between 1 and 120),
  species public.animal_species not null,
  weight_kg numeric(5, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, customer_id) references public.customers(tenant_id, id) on delete restrict,
  constraint pets_weight_positive check (weight_kg is null or weight_kg > 0)
);

create index pets_tenant_customer_idx on public.pets (tenant_id, customer_id);

create table public.booking_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null,
  channel public.booking_channel not null,
  service_type public.boarding_service_type not null default 'OVERNIGHT',
  check_in_date date not null,
  check_out_date date not null,
  legacy_booking_code text,
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, customer_id) references public.customers(tenant_id, id) on delete restrict,
  constraint booking_group_dates_valid check (check_out_date > check_in_date),
  constraint public_service_is_overnight check (
    channel not in ('WEBSITE', 'LINE') or service_type = 'OVERNIGHT'
  )
);

create index booking_groups_tenant_dates_idx
  on public.booking_groups (tenant_id, check_in_date, check_out_date);

create table public.room_inventory (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  room_code text not null,
  species public.animal_species not null,
  operational_status public.room_operational_status not null default 'AVAILABLE',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, room_code),
  unique (tenant_id, id),
  constraint room_code_matches_species check (
    (species = 'CAT' and room_code ~ '^CAT(0[1-9]|1[01])$')
    or (species = 'DOG' and room_code ~ '^DOG0[1-7]$')
  )
);

create index room_inventory_tenant_species_status_idx
  on public.room_inventory (tenant_id, species, operational_status);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_group_id uuid not null,
  room_id uuid,
  booking_code text,
  species public.animal_species not null,
  animal_count smallint not null check (animal_count between 1 and 2),
  status public.booking_status not null default 'PENDING_APPROVAL',
  payment_status public.payment_status not null default 'NOT_REQUIRED',
  health_review_status public.health_review_status not null default 'NOT_REQUIRED',
  nightly_rate_satang integer not null check (nightly_rate_satang in (15000, 20000)),
  deposit_deadline_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, booking_group_id)
    references public.booking_groups(tenant_id, id) on delete cascade,
  foreign key (tenant_id, room_id)
    references public.room_inventory(tenant_id, id) on delete restrict,
  constraint bookings_rate_matches_count check (
    (animal_count = 1 and nightly_rate_satang = 15000)
    or (animal_count = 2 and nightly_rate_satang = 20000)
  ),
  constraint line_deposit_state_consistent check (
    (status = 'APPROVED_AWAITING_DEPOSIT' and payment_status in ('WAITING', 'SUBMITTED'))
    or status <> 'APPROVED_AWAITING_DEPOSIT'
  )
);

create unique index bookings_tenant_booking_code_uidx
  on public.bookings (tenant_id, booking_code)
  where booking_code is not null;
create index bookings_tenant_status_room_idx on public.bookings (tenant_id, status, room_id);

create table public.booking_pets (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_id uuid not null,
  pet_id uuid not null,
  position smallint not null check (position between 1 and 2),
  created_at timestamptz not null default now(),
  primary key (booking_id, pet_id),
  unique (booking_id, position),
  foreign key (tenant_id, booking_id) references public.bookings(tenant_id, id) on delete cascade,
  foreign key (tenant_id, pet_id) references public.pets(tenant_id, id) on delete restrict
);

create index booking_pets_tenant_booking_idx on public.booking_pets (tenant_id, booking_id);

create table public.room_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_id uuid not null,
  room_id uuid not null,
  start_date date not null,
  end_date date not null,
  stay_range daterange generated always as (daterange(start_date, end_date, '[)')) stored,
  status public.allocation_status not null,
  released_at timestamptz,
  release_reason text,
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, booking_id) references public.bookings(tenant_id, id) on delete cascade,
  foreign key (tenant_id, room_id) references public.room_inventory(tenant_id, id) on delete restrict,
  constraint room_allocation_dates_valid check (end_date > start_date),
  constraint room_allocation_release_consistent check (
    (status in ('RELEASED', 'CANCELLED', 'EXPIRED') and released_at is not null and release_reason is not null)
    or (status in ('HOLD', 'RESERVED') and released_at is null)
  ),
  exclude using gist (
    tenant_id with =,
    room_id with =,
    stay_range with &&
  ) where (status in ('HOLD', 'RESERVED'))
);

create index room_allocations_tenant_room_dates_idx
  on public.room_allocations (tenant_id, room_id, start_date, end_date);
create index room_allocations_tenant_booking_idx
  on public.room_allocations (tenant_id, booking_id, status);

create table public.room_stays (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_id uuid not null,
  room_id uuid not null,
  checked_in_at timestamptz not null,
  checked_out_at timestamptz,
  check_in_notes text,
  deposit_satang integer not null default 0 check (deposit_satang >= 0),
  checked_in_by uuid references public.profiles(user_id) on delete restrict,
  checked_out_by uuid references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, booking_id) references public.bookings(tenant_id, id) on delete restrict,
  foreign key (tenant_id, room_id) references public.room_inventory(tenant_id, id) on delete restrict,
  constraint stay_checkout_after_checkin check (
    checked_out_at is null or checked_out_at >= checked_in_at
  )
);

create unique index room_stays_one_open_per_room_uidx
  on public.room_stays (tenant_id, room_id) where checked_out_at is null;
create unique index room_stays_one_open_per_booking_uidx
  on public.room_stays (tenant_id, booking_id) where checked_out_at is null;

create table public.daily_sequences (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sequence_kind text not null check (sequence_kind in ('BOOKING', 'RECEIPT')),
  sequence_date date not null,
  scope_key text not null default '',
  last_value integer not null check (last_value > 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, sequence_kind, sequence_date, scope_key)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  actor_user_id uuid references public.profiles(user_id) on delete set null,
  support_grant_id uuid,
  action text not null check (char_length(action) between 1 and 100),
  entity_type text not null check (char_length(entity_type) between 1 and 100),
  entity_id uuid,
  before_summary jsonb,
  after_summary jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create index audit_logs_tenant_created_idx on public.audit_logs (tenant_id, created_at desc);

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  idempotency_key text not null,
  payload jsonb not null,
  status public.outbox_status not null default 'PENDING',
  available_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  processed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create index outbox_events_work_queue_idx
  on public.outbox_events (status, available_at) where status in ('PENDING', 'FAILED');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tenants', 'profiles', 'tenant_memberships', 'customers', 'pets',
    'booking_groups', 'room_inventory', 'bookings', 'room_allocations', 'room_stays'
  ]
  loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

comment on column public.bookings.nightly_rate_satang is
  'Immutable quoted nightly rate in integer satang; 150 THB = 15000.';
comment on column public.room_allocations.stay_range is
  'Half-open planned range [check-in, check-out); touching checkout/check-in dates do not overlap.';
comment on table public.room_stays is
  'Physical occupancy source of truth. A planned checkout date never closes an open stay.';
