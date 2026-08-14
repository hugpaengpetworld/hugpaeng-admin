alter table public.booking_groups
add column customer_notes text,
add column public_created boolean not null default false;

alter table public.bookings
add column quoted_nights smallint not null default 1 check (quoted_nights > 0),
add column lodging_total_satang integer not null default 15000 check (lodging_total_satang > 0),
add column notes text,
add column reschedule_count smallint not null default 0 check (reschedule_count between 0 and 1);

create table public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  scope text not null check (char_length(scope) between 1 and 80),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 200),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, scope, idempotency_key)
);

create index idempotency_keys_expiry_idx on public.idempotency_keys (expires_at);

create table public.public_rate_limit_buckets (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  action text not null check (char_length(action) between 1 and 80),
  fingerprint_hash text not null check (fingerprint_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, action, fingerprint_hash, window_started_at)
);

create index public_rate_limit_cleanup_idx
  on public.public_rate_limit_buckets (window_started_at);

alter table public.idempotency_keys enable row level security;
alter table public.public_rate_limit_buckets enable row level security;

drop policy if exists customers_member_all on public.customers;
drop policy if exists pets_member_all on public.pets;
drop policy if exists booking_groups_member_all on public.booking_groups;
drop policy if exists bookings_member_all on public.bookings;
drop policy if exists booking_pets_member_all on public.booking_pets;

create policy customers_select_member on public.customers
for select to authenticated
using (public.is_active_tenant_member(tenant_id));

create policy pets_select_member on public.pets
for select to authenticated
using (public.is_active_tenant_member(tenant_id));

create policy booking_groups_select_member on public.booking_groups
for select to authenticated
using (public.is_active_tenant_member(tenant_id));

create policy bookings_select_member on public.bookings
for select to authenticated
using (public.is_active_tenant_member(tenant_id));

create policy booking_pets_select_member on public.booking_pets
for select to authenticated
using (public.is_active_tenant_member(tenant_id));

create or replace function public.consume_public_rate_limit(
  p_tenant_slug text,
  p_action text,
  p_fingerprint_hash text,
  p_max_requests integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_tenant_id uuid;
  current_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if p_fingerprint_hash !~ '^[0-9a-f]{64}$'
    or char_length(p_action) not between 1 and 80
    or p_max_requests not between 1 and 1000
  then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  select tenant.id into target_tenant_id
  from public.tenants tenant
  where tenant.slug = p_tenant_slug and tenant.status = 'ACTIVE';
  if target_tenant_id is null then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;

  insert into public.public_rate_limit_buckets (
    tenant_id,
    action,
    fingerprint_hash,
    window_started_at,
    request_count
  ) values (
    target_tenant_id,
    p_action,
    p_fingerprint_hash,
    date_trunc('hour', now()),
    1
  ) on conflict (tenant_id, action, fingerprint_hash, window_started_at)
  do update set request_count = public.public_rate_limit_buckets.request_count + 1,
                updated_at = now()
  returning request_count into current_count;

  if current_count > p_max_requests then
    raise exception using errcode = 'P0001', message = 'RATE_LIMITED';
  end if;
end;
$$;

revoke all on function public.consume_public_rate_limit(text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.consume_public_rate_limit(text, text, text, integer)
  to service_role;

create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
$$;

revoke all on function public.normalize_phone(text) from public, anon, authenticated;

create or replace function public.get_eligible_rooms(
  p_tenant_id uuid,
  p_species public.animal_species,
  p_check_in_date date,
  p_check_out_date date,
  p_exclude_booking_id uuid default null
)
returns table (room_id uuid, room_code text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;

  if not public.is_active_tenant_member(p_tenant_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if p_check_in_date is null or p_check_out_date <= p_check_in_date then
    raise exception using errcode = '22023', message = 'INVALID_DATE_RANGE';
  end if;

  return query
  select room.id, room.room_code
  from public.room_inventory room
  where room.tenant_id = p_tenant_id
    and room.species = p_species
    and room.operational_status = 'AVAILABLE'
    and not exists (
      select 1
      from public.room_stays stay
      where stay.tenant_id = room.tenant_id
        and stay.room_id = room.id
        and stay.checked_out_at is null
    )
    and not exists (
      select 1
      from public.room_allocations allocation
      where allocation.tenant_id = room.tenant_id
        and allocation.room_id = room.id
        and allocation.status in ('HOLD', 'RESERVED')
        and allocation.booking_id is distinct from p_exclude_booking_id
        and allocation.stay_range && daterange(p_check_in_date, p_check_out_date, '[)')
    )
  order by room.room_code;
end;
$$;

revoke all on function public.get_eligible_rooms(
  uuid,
  public.animal_species,
  date,
  date,
  uuid
) from public, anon;
grant execute on function public.get_eligible_rooms(
  uuid,
  public.animal_species,
  date,
  date,
  uuid
) to authenticated;

create or replace function public.get_public_availability(
  p_tenant_slug text,
  p_species public.animal_species,
  p_animal_count integer,
  p_weights_kg numeric[],
  p_check_in_date date,
  p_check_out_date date
)
returns table (
  available_count integer,
  nights integer,
  nightly_rate_satang integer,
  lodging_total_satang integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_tenant_id uuid;
  calculated_nights integer;
  calculated_rate integer;
begin
  select tenant.id into target_tenant_id
  from public.tenants tenant
  where tenant.slug = p_tenant_slug
    and tenant.status = 'ACTIVE';

  if target_tenant_id is null then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;

  calculated_nights := p_check_out_date - p_check_in_date;
  if calculated_nights < 1 then
    raise exception using errcode = '22023', message = 'INVALID_DATE_RANGE';
  end if;

  if p_animal_count not between 1 and 2
    or coalesce(array_length(p_weights_kg, 1), 0) <> p_animal_count
  then
    raise exception using errcode = '22023', message = 'CAPACITY_EXCEEDED';
  end if;

  if p_species = 'DOG' and (
    exists (select 1 from unnest(p_weights_kg) weight where weight is null or weight <= 0)
    or (p_animal_count = 1 and p_weights_kg[1] > 20)
    or (p_animal_count = 2 and exists (
      select 1 from unnest(p_weights_kg) weight where weight > 8
    ))
  ) then
    raise exception using errcode = '22023', message = 'INVALID_DOG_WEIGHT';
  end if;

  calculated_rate := case p_animal_count when 1 then 15000 else 20000 end;

  return query
  select
    count(*)::integer,
    calculated_nights,
    calculated_rate,
    calculated_nights * calculated_rate
  from public.room_inventory room
  where room.tenant_id = target_tenant_id
    and room.species = p_species
    and room.operational_status = 'AVAILABLE'
    and not exists (
      select 1 from public.room_stays stay
      where stay.tenant_id = room.tenant_id
        and stay.room_id = room.id
        and stay.checked_out_at is null
    )
    and not exists (
      select 1 from public.room_allocations allocation
      where allocation.tenant_id = room.tenant_id
        and allocation.room_id = room.id
        and allocation.status in ('HOLD', 'RESERVED')
        and allocation.stay_range && daterange(p_check_in_date, p_check_out_date, '[)')
    );
end;
$$;

revoke all on function public.get_public_availability(
  text,
  public.animal_species,
  integer,
  numeric[],
  date,
  date
) from public, anon, authenticated;
grant execute on function public.get_public_availability(
  text,
  public.animal_species,
  integer,
  numeric[],
  date,
  date
) to service_role;

create or replace function public.create_booking_group_internal(
  p_tenant_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_line_user_id text,
  p_channel public.booking_channel,
  p_check_in_date date,
  p_check_out_date date,
  p_customer_notes text,
  p_units jsonb,
  p_created_by uuid,
  p_public_created boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_name text := btrim(coalesce(p_customer_name, ''));
  clean_phone text := public.normalize_phone(p_customer_phone);
  calculated_nights integer := p_check_out_date - p_check_in_date;
  created_customer_id uuid;
  created_group_id uuid;
  created_booking_id uuid;
  created_pet_id uuid;
  created_vaccination_asset_id uuid;
  selected_room_id uuid;
  selected_room_code text;
  unit jsonb;
  pet jsonb;
  unit_species public.animal_species;
  unit_pet_count integer;
  unit_rate integer;
  unit_position integer;
  pet_position integer;
  pet_weight numeric;
  booking_codes jsonb := '[]'::jsonb;
begin
  if char_length(clean_name) not between 1 and 200
    or clean_phone !~ '^\+?[0-9]{8,15}$'
  then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  if calculated_nights < 1 then
    raise exception using errcode = '22023', message = 'INVALID_DATE_RANGE';
  end if;

  if jsonb_typeof(p_units) <> 'array'
    or jsonb_array_length(p_units) not between 1 and 18
  then
    raise exception using errcode = '22023', message = 'CAPACITY_EXCEEDED';
  end if;

  if p_channel = 'LINE' and nullif(btrim(coalesce(p_line_user_id, '')), '') is null then
    raise exception using errcode = '22023', message = 'LINE_ID_REQUIRED';
  end if;

  perform 1
  from public.room_inventory room
  where room.tenant_id = p_tenant_id
    and room.id in (
      select (value->>'roomId')::uuid from jsonb_array_elements(p_units)
    )
  order by room.id
  for update;

  insert into public.customers (tenant_id, full_name, phone, line_user_id)
  values (
    p_tenant_id,
    clean_name,
    clean_phone,
    nullif(btrim(coalesce(p_line_user_id, '')), '')
  )
  returning id into created_customer_id;

  insert into public.booking_groups (
    tenant_id,
    customer_id,
    channel,
    service_type,
    check_in_date,
    check_out_date,
    customer_notes,
    public_created,
    created_by
  ) values (
    p_tenant_id,
    created_customer_id,
    p_channel,
    'OVERNIGHT',
    p_check_in_date,
    p_check_out_date,
    nullif(btrim(coalesce(p_customer_notes, '')), ''),
    p_public_created,
    p_created_by
  ) returning id into created_group_id;

  unit_position := 0;
  for unit in select value from jsonb_array_elements(p_units)
  loop
    unit_position := unit_position + 1;
    if unit->>'species' not in ('CAT', 'DOG') then
      raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
    end if;
    unit_species := (unit->>'species')::public.animal_species;
    selected_room_id := (unit->>'roomId')::uuid;

    if jsonb_typeof(unit->'pets') <> 'array' then
      raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
    end if;
    unit_pet_count := jsonb_array_length(unit->'pets');
    if unit_pet_count not between 1 and 2 then
      raise exception using errcode = '22023', message = 'CAPACITY_EXCEEDED';
    end if;
    unit_rate := case unit_pet_count when 1 then 15000 else 20000 end;

    select room.room_code into selected_room_code
    from public.room_inventory room
    where room.id = selected_room_id
      and room.tenant_id = p_tenant_id
      and room.species = unit_species
      and room.operational_status = 'AVAILABLE';

    if selected_room_code is null then
      raise exception using errcode = '23P01', message = 'ROOM_UNAVAILABLE';
    end if;

    if exists (
      select 1 from public.room_stays stay
      where stay.tenant_id = p_tenant_id
        and stay.room_id = selected_room_id
        and stay.checked_out_at is null
    ) then
      raise exception using errcode = '23P01', message = 'ROOM_UNAVAILABLE';
    end if;

    insert into public.bookings (
      tenant_id,
      booking_group_id,
      room_id,
      booking_code,
      species,
      animal_count,
      status,
      payment_status,
      health_review_status,
      nightly_rate_satang,
      quoted_nights,
      lodging_total_satang,
      notes
    ) values (
      p_tenant_id,
      created_group_id,
      selected_room_id,
      public.next_booking_code(p_tenant_id, selected_room_code, p_check_in_date),
      unit_species,
      unit_pet_count,
      'PENDING_APPROVAL',
      'NOT_REQUIRED',
      'NOT_REQUIRED',
      unit_rate,
      calculated_nights,
      unit_rate * calculated_nights,
      nullif(btrim(coalesce(unit->>'notes', '')), '')
    ) returning id into created_booking_id;

    begin
      insert into public.room_allocations (
        tenant_id,
        booking_id,
        room_id,
        start_date,
        end_date,
        status,
        created_by
      ) values (
        p_tenant_id,
        created_booking_id,
        selected_room_id,
        p_check_in_date,
        p_check_out_date,
        'HOLD',
        p_created_by
      );
    exception when exclusion_violation then
      raise exception using errcode = '23P01', message = 'ROOM_UNAVAILABLE';
    end;

    pet_position := 0;
    for pet in select value from jsonb_array_elements(unit->'pets')
    loop
      pet_position := pet_position + 1;
      created_vaccination_asset_id := null;
      if char_length(btrim(coalesce(pet->>'name', ''))) not between 1 and 120 then
        raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
      end if;

      pet_weight := nullif(pet->>'weightKg', '')::numeric;
      if pet_weight is not null and pet_weight <= 0 then
        raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
      end if;
      if unit_species = 'DOG' and (
        pet_weight is null
        or (unit_pet_count = 1 and pet_weight > 20)
        or (unit_pet_count = 2 and pet_weight > 8)
      ) then
        raise exception using errcode = '22023', message = 'INVALID_DOG_WEIGHT';
      end if;

      insert into public.pets (
        tenant_id,
        customer_id,
        name,
        species,
        weight_kg
      ) values (
        p_tenant_id,
        created_customer_id,
        btrim(pet->>'name'),
        unit_species,
        pet_weight
      ) returning id into created_pet_id;

      insert into public.booking_pets (tenant_id, booking_id, pet_id, position)
      values (p_tenant_id, created_booking_id, created_pet_id, pet_position);

      if pet ? 'vaccinationEvidence' then
        if not p_public_created
          or split_part(coalesce(pet->'vaccinationEvidence'->>'storagePath', ''), '/', 1) <> p_tenant_id::text
          or split_part(coalesce(pet->'vaccinationEvidence'->>'storagePath', ''), '/', 2) <> 'vaccination'
          or coalesce(pet->'vaccinationEvidence'->>'mimeType', '') not in (
            'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
          )
          or (pet->'vaccinationEvidence'->>'sizeBytes')::bigint not between 1 and 10485760
        then
          raise exception using errcode = '22023', message = 'INVALID_VACCINATION_EVIDENCE';
        end if;

        insert into public.file_assets (
          tenant_id, storage_path, purpose, entity_type, entity_id,
          mime_type, size_bytes, validated_at
        ) values (
          p_tenant_id,
          pet->'vaccinationEvidence'->>'storagePath',
          'VACCINATION',
          'PET',
          created_pet_id,
          pet->'vaccinationEvidence'->>'mimeType',
          (pet->'vaccinationEvidence'->>'sizeBytes')::bigint,
          now()
        ) returning id into created_vaccination_asset_id;
      end if;

      if pet ? 'fleaTickTreated' or created_vaccination_asset_id is not null then
        insert into public.pet_health_profiles (
          pet_id,
          tenant_id,
          vaccination_asset_id,
          flea_tick_treated,
          flea_tick_product,
          flea_tick_treated_on
        ) values (
          created_pet_id,
          p_tenant_id,
          created_vaccination_asset_id,
          case when pet ? 'fleaTickTreated' then (pet->>'fleaTickTreated')::boolean end,
          nullif(btrim(coalesce(pet->>'fleaTickProduct', '')), ''),
          nullif(pet->>'fleaTickTreatedOn', '')::date
        );

        if created_vaccination_asset_id is not null
          or (pet ? 'fleaTickTreated' and (pet->>'fleaTickTreated')::boolean is false)
        then
          update public.bookings
          set health_review_status = 'PENDING'
          where id = created_booking_id;
        end if;
      end if;
    end loop;

    booking_codes := booking_codes || jsonb_build_array(jsonb_build_object(
      'bookingId', created_booking_id,
      'bookingCode', (
        select booking.booking_code from public.bookings booking
        where booking.id = created_booking_id
      ),
      'roomCode', selected_room_code
    ));
  end loop;

  insert into public.audit_logs (
    tenant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    after_summary
  ) values (
    p_tenant_id,
    p_created_by,
    case when p_public_created then 'PUBLIC_BOOKING_REQUEST_CREATED' else 'BACK_OFFICE_BOOKING_CREATED' end,
    'BOOKING_GROUP',
    created_group_id,
    jsonb_build_object(
      'channel', p_channel,
      'check_in_date', p_check_in_date,
      'check_out_date', p_check_out_date,
      'room_count', jsonb_array_length(p_units)
    )
  );

  return jsonb_build_object(
    'bookingGroupId', created_group_id,
    'bookings', booking_codes,
    'status', 'PENDING_APPROVAL'
  );
end;
$$;

revoke all on function public.create_booking_group_internal(
  uuid,
  text,
  text,
  text,
  public.booking_channel,
  date,
  date,
  text,
  jsonb,
  uuid,
  boolean
) from public, anon, authenticated, service_role;

create or replace function public.create_back_office_booking(
  p_tenant_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_line_user_id text,
  p_channel public.booking_channel,
  p_check_in_date date,
  p_check_out_date date,
  p_customer_notes text,
  p_units jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  return public.create_booking_group_internal(
    p_tenant_id,
    p_customer_name,
    p_customer_phone,
    p_line_user_id,
    p_channel,
    p_check_in_date,
    p_check_out_date,
    p_customer_notes,
    p_units,
    auth.uid(),
    false
  );
end;
$$;

revoke all on function public.create_back_office_booking(
  uuid,
  text,
  text,
  text,
  public.booking_channel,
  date,
  date,
  text,
  jsonb
) from public, anon;
grant execute on function public.create_back_office_booking(
  uuid,
  text,
  text,
  text,
  public.booking_channel,
  date,
  date,
  text,
  jsonb
) to authenticated;

create or replace function public.create_public_booking_request(
  p_tenant_slug text,
  p_idempotency_key text,
  p_request_hash text,
  p_fingerprint_hash text,
  p_customer_name text,
  p_customer_phone text,
  p_check_in_date date,
  p_check_out_date date,
  p_species public.animal_species,
  p_pets jsonb,
  p_customer_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_tenant_id uuid;
  current_window timestamptz := date_trunc('hour', now());
  current_count integer;
  existing_key public.idempotency_keys%rowtype;
  claimed_key_id uuid;
  selected_room_id uuid;
  booking_result jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if p_request_hash !~ '^[0-9a-f]{64}$'
    or p_fingerprint_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  select tenant.id into target_tenant_id
  from public.tenants tenant
  where tenant.slug = p_tenant_slug and tenant.status = 'ACTIVE';
  if target_tenant_id is null then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;

  delete from public.idempotency_keys key
  where key.tenant_id = target_tenant_id
    and key.scope = 'PUBLIC_BOOKING_CREATE'
    and key.idempotency_key = p_idempotency_key
    and key.expires_at <= now();

  insert into public.idempotency_keys (
    tenant_id, scope, idempotency_key, request_hash, expires_at
  ) values (
    target_tenant_id, 'PUBLIC_BOOKING_CREATE', p_idempotency_key,
    p_request_hash, now() + interval '24 hours'
  ) on conflict (tenant_id, scope, idempotency_key) do nothing
  returning id into claimed_key_id;

  if claimed_key_id is null then
    select * into existing_key
    from public.idempotency_keys key
    where key.tenant_id = target_tenant_id
      and key.scope = 'PUBLIC_BOOKING_CREATE'
      and key.idempotency_key = p_idempotency_key
    for update;
    if existing_key.request_hash <> p_request_hash then
      raise exception using errcode = '22023', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return existing_key.result || jsonb_build_object('idempotencyReplay', true);
  end if;

  insert into public.public_rate_limit_buckets (
    tenant_id,
    action,
    fingerprint_hash,
    window_started_at,
    request_count
  ) values (
    target_tenant_id,
    'PUBLIC_BOOKING_CREATE',
    p_fingerprint_hash,
    current_window,
    1
  ) on conflict (tenant_id, action, fingerprint_hash, window_started_at)
  do update set request_count = public.public_rate_limit_buckets.request_count + 1,
                updated_at = now()
  returning request_count into current_count;
  if current_count > 10 then
    raise exception using errcode = 'P0001', message = 'RATE_LIMITED';
  end if;

  select room.id into selected_room_id
  from public.room_inventory room
  where room.tenant_id = target_tenant_id
    and room.species = p_species
    and room.operational_status = 'AVAILABLE'
    and not exists (
      select 1 from public.room_stays stay
      where stay.tenant_id = room.tenant_id
        and stay.room_id = room.id
        and stay.checked_out_at is null
    )
    and not exists (
      select 1 from public.room_allocations allocation
      where allocation.tenant_id = room.tenant_id
        and allocation.room_id = room.id
        and allocation.status in ('HOLD', 'RESERVED')
        and allocation.stay_range && daterange(p_check_in_date, p_check_out_date, '[)')
    )
  order by room.room_code
  for update skip locked
  limit 1;

  if selected_room_id is null then
    raise exception using errcode = '23P01', message = 'ROOM_UNAVAILABLE';
  end if;

  booking_result := public.create_booking_group_internal(
    target_tenant_id,
    p_customer_name,
    p_customer_phone,
    null,
    'WEBSITE',
    p_check_in_date,
    p_check_out_date,
    p_customer_notes,
    jsonb_build_array(jsonb_build_object(
      'species', p_species,
      'roomId', selected_room_id,
      'pets', p_pets
    )),
    null,
    true
  );

  update public.idempotency_keys
  set result = booking_result
  where id = claimed_key_id;

  return booking_result;
end;
$$;

revoke all on function public.create_public_booking_request(
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  date,
  public.animal_species,
  jsonb,
  text
) from public, anon, authenticated;
grant execute on function public.create_public_booking_request(
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  date,
  public.animal_species,
  jsonb,
  text
) to service_role;

comment on function public.get_public_availability(
  text,
  public.animal_species,
  integer,
  numeric[],
  date,
  date
) is 'Service-only aggregate capacity projection; exact room identifiers are never returned publicly.';
comment on function public.create_public_booking_request(
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  date,
  public.animal_species,
  jsonb,
  text
) is 'Service-only, rate-limited, idempotent public request creation with atomic room hold.';
