set search_path = public, extensions;

create type public.sterilization_species as enum ('CAT', 'DOG', 'OTHER');
create type public.sterilization_sex as enum ('MALE', 'FEMALE');
create type public.sterilization_status as enum (
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'ARRIVED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW'
);

alter table public.daily_sequences
  drop constraint if exists daily_sequences_sequence_kind_check;
alter table public.daily_sequences
  add constraint daily_sequences_sequence_kind_check
  check (sequence_kind in ('BOOKING', 'RECEIPT', 'STERILIZATION'));

create table public.sterilization_holidays (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  holiday_date date not null,
  reason text not null check (char_length(reason) between 1 and 300),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  updated_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, holiday_date),
  unique (tenant_id, id)
);

create table public.sterilization_appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  appointment_code text not null,
  appointment_date date not null,
  appointment_time time not null,
  customer_name text not null check (char_length(customer_name) between 1 and 120),
  phone text not null check (phone ~ '^\+?[0-9]{8,15}$'),
  pet_name text not null check (char_length(pet_name) between 1 and 100),
  species public.sterilization_species not null,
  custom_species text,
  sex public.sterilization_sex not null,
  breed text check (breed is null or char_length(breed) <= 100),
  weight_kg numeric(5, 2) check (weight_kg is null or weight_kg > 0),
  age_text text check (age_text is null or char_length(age_text) <= 60),
  vaccination_status text check (
    vaccination_status is null or char_length(vaccination_status) <= 200
  ),
  source_channel public.booking_channel not null,
  status public.sterilization_status not null default 'PENDING_CONFIRMATION',
  notes text check (notes is null or char_length(notes) <= 1000),
  overbook_acknowledged boolean not null default false,
  holiday_override boolean not null default false,
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  updated_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, appointment_code),
  unique (tenant_id, id),
  constraint sterilization_custom_species_consistent check (
    (species = 'OTHER' and custom_species is not null and char_length(trim(custom_species)) between 1 and 50)
    or (species <> 'OTHER' and custom_species is null)
  ),
  constraint sterilization_channel_back_office_only check (
    source_channel in ('FACEBOOK', 'PHONE', 'WALK_IN', 'OTHER')
  )
);

create index sterilization_appointments_tenant_date_status_idx
  on public.sterilization_appointments (tenant_id, appointment_date, status);
create index sterilization_appointments_tenant_phone_idx
  on public.sterilization_appointments (tenant_id, phone);
create index sterilization_holidays_tenant_month_idx
  on public.sterilization_holidays (tenant_id, holiday_date)
  where is_active;

create trigger sterilization_appointments_set_updated_at
before update on public.sterilization_appointments
for each row execute function public.set_updated_at();

create trigger sterilization_holidays_set_updated_at
before update on public.sterilization_holidays
for each row execute function public.set_updated_at();

alter table public.sterilization_appointments enable row level security;
alter table public.sterilization_holidays enable row level security;

create policy sterilization_appointments_select_member
on public.sterilization_appointments
for select to authenticated
using (public.is_active_tenant_member(tenant_id));

create policy sterilization_holidays_select_member
on public.sterilization_holidays
for select to authenticated
using (public.is_active_tenant_member(tenant_id));

create or replace function public.sterilization_status_consumes_capacity(
  p_status public.sterilization_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('PENDING_CONFIRMATION', 'CONFIRMED', 'ARRIVED');
$$;

create or replace function public.can_transition_sterilization_status(
  p_from public.sterilization_status,
  p_to public.sterilization_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_from
    when 'PENDING_CONFIRMATION' then p_to in ('CONFIRMED', 'CANCELLED', 'NO_SHOW')
    when 'CONFIRMED' then p_to in ('ARRIVED', 'CANCELLED', 'NO_SHOW')
    when 'ARRIVED' then p_to in ('COMPLETED', 'CANCELLED')
    else false
  end;
$$;

create or replace function public.next_sterilization_code(
  p_tenant_id uuid,
  p_appointment_date date
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_value integer;
begin
  insert into public.daily_sequences (
    tenant_id,
    sequence_kind,
    sequence_date,
    scope_key,
    last_value
  ) values (
    p_tenant_id,
    'STERILIZATION',
    p_appointment_date,
    '',
    1
  )
  on conflict (tenant_id, sequence_kind, sequence_date, scope_key)
  do update set
    last_value = public.daily_sequences.last_value + 1,
    updated_at = now()
  returning last_value into next_value;

  if next_value > 9999 then
    raise exception using errcode = '22003', message = 'STERILIZATION_CODE_SEQUENCE_EXHAUSTED';
  end if;

  return format(
    'SPAY-%s-%s',
    to_char(p_appointment_date, 'YYYYMMDD'),
    lpad(next_value::text, 4, '0')
  );
end;
$$;

revoke all on function public.next_sterilization_code(uuid, date)
from public, anon, authenticated;

create or replace function public.create_sterilization_appointment(
  p_tenant_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_customer_name text,
  p_phone text,
  p_pet_name text,
  p_species public.sterilization_species,
  p_custom_species text,
  p_sex public.sterilization_sex,
  p_breed text,
  p_weight_kg numeric,
  p_age_text text,
  p_vaccination_status text,
  p_source_channel public.booking_channel,
  p_notes text,
  p_acknowledge_overbook boolean default false,
  p_holiday_override boolean default false
)
returns table (appointment_id uuid, appointment_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_count integer;
  normalized_phone text;
  holiday_reason text;
  created_id uuid;
  created_code text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  if not public.has_tenant_role(
    p_tenant_id,
    array['OWNER', 'DOCTOR', 'STAFF']::public.clinic_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if p_appointment_date < (now() at time zone 'Asia/Bangkok')::date then
    raise exception using errcode = '22023', message = 'APPOINTMENT_DATE_IN_PAST';
  end if;
  if p_source_channel not in ('FACEBOOK', 'PHONE', 'WALK_IN', 'OTHER') then
    raise exception using errcode = '22023', message = 'BACK_OFFICE_CHANNEL_REQUIRED';
  end if;
  if p_species = 'OTHER' and nullif(trim(p_custom_species), '') is null then
    raise exception using errcode = '22023', message = 'CUSTOM_SPECIES_REQUIRED';
  end if;
  if p_species <> 'OTHER' and nullif(trim(p_custom_species), '') is not null then
    raise exception using errcode = '22023', message = 'CUSTOM_SPECIES_NOT_ALLOWED';
  end if;

  normalized_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  if normalized_phone !~ '^\+?[0-9]{8,15}$' then
    raise exception using errcode = '22023', message = 'INVALID_PHONE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':' || p_appointment_date::text, 0)
  );

  select holiday.reason
  into holiday_reason
  from public.sterilization_holidays holiday
  where holiday.tenant_id = p_tenant_id
    and holiday.holiday_date = p_appointment_date
    and holiday.is_active;

  if holiday_reason is not null and not p_holiday_override then
    raise exception using errcode = 'P0001', message = 'STERILIZATION_HOLIDAY';
  end if;
  if holiday_reason is not null
     and p_holiday_override
     and not public.has_tenant_role(
       p_tenant_id,
       array['OWNER', 'DOCTOR']::public.clinic_role[]
     ) then
    raise exception using errcode = '42501', message = 'HOLIDAY_OVERRIDE_FORBIDDEN';
  end if;

  select count(*)::integer
  into active_count
  from public.sterilization_appointments appointment
  where appointment.tenant_id = p_tenant_id
    and appointment.appointment_date = p_appointment_date
    and public.sterilization_status_consumes_capacity(appointment.status);

  if active_count >= 4 and not p_acknowledge_overbook then
    raise exception using errcode = 'P0001', message = 'OVERBOOK_ACKNOWLEDGEMENT_REQUIRED';
  end if;

  created_id := gen_random_uuid();
  created_code := public.next_sterilization_code(p_tenant_id, p_appointment_date);
  insert into public.sterilization_appointments (
    id,
    tenant_id,
    appointment_code,
    appointment_date,
    appointment_time,
    customer_name,
    phone,
    pet_name,
    species,
    custom_species,
    sex,
    breed,
    weight_kg,
    age_text,
    vaccination_status,
    source_channel,
    notes,
    overbook_acknowledged,
    holiday_override,
    created_by,
    updated_by
  ) values (
    created_id,
    p_tenant_id,
    created_code,
    p_appointment_date,
    p_appointment_time,
    trim(p_customer_name),
    normalized_phone,
    trim(p_pet_name),
    p_species,
    case when p_species = 'OTHER' then trim(p_custom_species) else null end,
    p_sex,
    nullif(trim(p_breed), ''),
    p_weight_kg,
    nullif(trim(p_age_text), ''),
    nullif(trim(p_vaccination_status), ''),
    p_source_channel,
    nullif(trim(p_notes), ''),
    active_count >= 4,
    holiday_reason is not null and p_holiday_override,
    auth.uid(),
    auth.uid()
  );

  insert into public.audit_logs (
    tenant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    after_summary
  ) values (
    p_tenant_id,
    auth.uid(),
    'STERILIZATION_CREATED',
    'STERILIZATION_APPOINTMENT',
    created_id,
    jsonb_build_object(
      'appointment_code', created_code,
      'appointment_date', p_appointment_date,
      'overbook_acknowledged', active_count >= 4,
      'holiday_override', holiday_reason is not null and p_holiday_override
    )
  );

  if active_count >= 4 then
    insert into public.audit_logs (
      tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
    ) values (
      p_tenant_id,
      auth.uid(),
      'STERILIZATION_OVERBOOK_ACKNOWLEDGED',
      'STERILIZATION_APPOINTMENT',
      created_id,
      jsonb_build_object('previous_active_count', active_count)
    );
  end if;

  if holiday_reason is not null and p_holiday_override then
    insert into public.audit_logs (
      tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
    ) values (
      p_tenant_id,
      auth.uid(),
      'STERILIZATION_HOLIDAY_OVERRIDE',
      'STERILIZATION_APPOINTMENT',
      created_id,
      jsonb_build_object('holiday_reason', holiday_reason)
    );
  end if;

  return query select created_id, created_code;
end;
$$;

revoke all on function public.create_sterilization_appointment(
  uuid, date, time, text, text, text, public.sterilization_species, text,
  public.sterilization_sex, text, numeric, text, text, public.booking_channel,
  text, boolean, boolean
) from public, anon;
grant execute on function public.create_sterilization_appointment(
  uuid, date, time, text, text, text, public.sterilization_species, text,
  public.sterilization_sex, text, numeric, text, text, public.booking_channel,
  text, boolean, boolean
) to authenticated;

create or replace function public.update_sterilization_status(
  p_appointment_id uuid,
  p_status public.sterilization_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.sterilization_appointments%rowtype;
begin
  select * into target
  from public.sterilization_appointments
  where id = p_appointment_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;
  if not public.has_tenant_role(
    target.tenant_id,
    array['OWNER', 'DOCTOR', 'STAFF']::public.clinic_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if not public.can_transition_sterilization_status(target.status, p_status) then
    raise exception using errcode = 'P0001', message = 'INVALID_STATUS_TRANSITION';
  end if;

  update public.sterilization_appointments
  set status = p_status, updated_by = auth.uid()
  where id = target.id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id,
    before_summary, after_summary
  ) values (
    target.tenant_id,
    auth.uid(),
    'STERILIZATION_STATUS_CHANGED',
    'STERILIZATION_APPOINTMENT',
    target.id,
    jsonb_build_object('status', target.status),
    jsonb_build_object('status', p_status)
  );
end;
$$;

revoke all on function public.update_sterilization_status(
  uuid, public.sterilization_status
) from public, anon;
grant execute on function public.update_sterilization_status(
  uuid, public.sterilization_status
) to authenticated;

create or replace function public.save_sterilization_holiday(
  p_tenant_id uuid,
  p_holiday_date date,
  p_reason text,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  holiday_id uuid;
begin
  if not public.has_tenant_role(
    p_tenant_id,
    array['OWNER', 'DOCTOR']::public.clinic_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'REASON_REQUIRED';
  end if;

  insert into public.sterilization_holidays (
    tenant_id, holiday_date, reason, is_active, created_by, updated_by
  ) values (
    p_tenant_id, p_holiday_date, trim(p_reason), p_is_active, auth.uid(), auth.uid()
  )
  on conflict (tenant_id, holiday_date)
  do update set
    reason = excluded.reason,
    is_active = excluded.is_active,
    updated_by = auth.uid()
  returning id into holiday_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    p_tenant_id,
    auth.uid(),
    case when p_is_active then 'STERILIZATION_HOLIDAY_SAVED'
      else 'STERILIZATION_HOLIDAY_REMOVED' end,
    'STERILIZATION_HOLIDAY',
    holiday_id,
    jsonb_build_object(
      'holiday_date', p_holiday_date,
      'reason', trim(p_reason),
      'is_active', p_is_active
    )
  );

  return holiday_id;
end;
$$;

revoke all on function public.save_sterilization_holiday(
  uuid, date, text, boolean
) from public, anon;
grant execute on function public.save_sterilization_holiday(
  uuid, date, text, boolean
) to authenticated;

comment on table public.sterilization_appointments is
  'Back-office-only sterilization calendar. Capacity is four active appointments per tenant/date; audited acknowledgement permits overbooking.';
comment on function public.create_sterilization_appointment(
  uuid, date, time, text, text, text, public.sterilization_species, text,
  public.sterilization_sex, text, numeric, text, text, public.booking_channel,
  text, boolean, boolean
) is
  'Atomic appointment creation with tenant/date advisory lock, holiday authorization, overbook acknowledgement, and audit facts.';
