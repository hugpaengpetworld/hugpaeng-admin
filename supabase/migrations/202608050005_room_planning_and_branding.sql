alter table public.room_inventory
add column version integer not null default 1 check (version > 0);

drop policy if exists rooms_mutate_clinic_roles on public.room_inventory;
drop policy if exists tenant_settings_mutate_owner on public.tenant_settings;
drop policy if exists tenants_update_owner on public.tenants;
drop policy if exists file_assets_insert_member on public.file_assets;
drop policy if exists tenant_assets_insert_member on storage.objects;

create policy file_assets_insert_by_purpose on public.file_assets
for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and case purpose
    when 'BRANDING' then public.has_tenant_role(
      tenant_id,
      array['OWNER']::public.clinic_role[]
    )
    when 'VACCINATION' then public.has_tenant_role(
      tenant_id,
      array['OWNER', 'DOCTOR']::public.clinic_role[]
    )
    when 'PAYMENT_EVIDENCE' then public.has_tenant_role(
      tenant_id,
      array['OWNER', 'STAFF']::public.clinic_role[]
    )
    else false
  end
);

create policy tenant_assets_insert_by_purpose on storage.objects
for insert to authenticated
with check (
  bucket_id = 'tenant-assets'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then case (storage.foldername(name))[2]
        when 'branding' then public.has_tenant_role(
          ((storage.foldername(name))[1])::uuid,
          array['OWNER']::public.clinic_role[]
        )
        when 'vaccination' then public.has_tenant_role(
          ((storage.foldername(name))[1])::uuid,
          array['OWNER', 'DOCTOR']::public.clinic_role[]
        )
        when 'payment-evidence' then public.has_tenant_role(
          ((storage.foldername(name))[1])::uuid,
          array['OWNER', 'STAFF']::public.clinic_role[]
        )
        else false
      end
    else false
  end
);

create or replace function public.get_room_plan(
  p_tenant_id uuid,
  p_species public.animal_species,
  p_plan_date date
)
returns table (
  room_id uuid,
  room_code text,
  species public.animal_species,
  operational_status public.room_operational_status,
  version integer,
  display_status text,
  booking_id uuid,
  booking_code text,
  pet_names text[],
  planned_check_in date,
  planned_check_out date,
  checked_in_at timestamptz
)
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

  return query
  select
    room.id,
    room.room_code,
    room.species,
    room.operational_status,
    room.version,
    case
      when open_stay.id is not null then 'OCCUPIED'
      when room.operational_status <> 'AVAILABLE' then room.operational_status::text
      when active_allocation.status = 'HOLD' then 'PENDING'
      when active_allocation.status = 'RESERVED' then 'CONFIRMED'
      else 'AVAILABLE'
    end as display_status,
    coalesce(open_stay.booking_id, active_allocation.booking_id) as booking_id,
    active_booking.booking_code,
    coalesce(assigned_pets.pet_names, array[]::text[]) as pet_names,
    booking_group.check_in_date,
    booking_group.check_out_date,
    open_stay.checked_in_at
  from public.room_inventory room
  left join lateral (
    select stay.id, stay.booking_id, stay.checked_in_at
    from public.room_stays stay
    where stay.tenant_id = room.tenant_id
      and stay.room_id = room.id
      and stay.checked_out_at is null
    limit 1
  ) open_stay on true
  left join lateral (
    select allocation.booking_id, allocation.status
    from public.room_allocations allocation
    where allocation.tenant_id = room.tenant_id
      and allocation.room_id = room.id
      and allocation.status in ('HOLD', 'RESERVED')
      and allocation.start_date <= p_plan_date
      and allocation.end_date > p_plan_date
    order by allocation.created_at
    limit 1
  ) active_allocation on true
  left join public.bookings active_booking
    on active_booking.tenant_id = room.tenant_id
   and active_booking.id = coalesce(open_stay.booking_id, active_allocation.booking_id)
  left join public.booking_groups booking_group
    on booking_group.tenant_id = active_booking.tenant_id
   and booking_group.id = active_booking.booking_group_id
  left join lateral (
    select array_agg(pet.name order by booking_pet.position) as pet_names
    from public.booking_pets booking_pet
    join public.pets pet
      on pet.tenant_id = booking_pet.tenant_id
     and pet.id = booking_pet.pet_id
    where booking_pet.tenant_id = active_booking.tenant_id
      and booking_pet.booking_id = active_booking.id
  ) assigned_pets on true
  where room.tenant_id = p_tenant_id
    and room.species = p_species
  order by room.room_code;
end;
$$;

revoke all on function public.get_room_plan(uuid, public.animal_species, date)
  from public, anon;
grant execute on function public.get_room_plan(uuid, public.animal_species, date)
  to authenticated;

create or replace function public.change_room_operational_state(
  p_room_id uuid,
  p_new_status public.room_operational_status,
  p_reason text,
  p_expected_version integer
)
returns table (
  room_id uuid,
  operational_status public.room_operational_status,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_room public.room_inventory%rowtype;
  clean_reason text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;

  select * into target_room
  from public.room_inventory room
  where room.id = p_room_id
  for update;

  if target_room.id is null then
    raise exception using errcode = 'P0002', message = 'ROOM_NOT_FOUND';
  end if;

  if not public.has_tenant_role(
    target_room.tenant_id,
    array['OWNER', 'DOCTOR', 'STAFF']::public.clinic_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if target_room.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  clean_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if p_new_status in ('MAINTENANCE', 'DISABLED') and clean_reason is null then
    raise exception using errcode = '22023', message = 'REASON_REQUIRED';
  end if;

  if p_new_status = 'AVAILABLE' and exists (
    select 1
    from public.room_stays stay
    where stay.tenant_id = target_room.tenant_id
      and stay.room_id = target_room.id
      and stay.checked_out_at is null
  ) then
    raise exception using errcode = '55000', message = 'OPEN_STAY_EXISTS';
  end if;

  if target_room.operational_status = p_new_status then
    raise exception using errcode = '22023', message = 'ROOM_STATE_UNCHANGED';
  end if;

  update public.room_inventory room
  set operational_status = p_new_status,
      notes = case
        when p_new_status in ('MAINTENANCE', 'DISABLED') then clean_reason
        when p_new_status = 'AVAILABLE' then null
        else room.notes
      end,
      version = room.version + 1
  where room.id = target_room.id;

  insert into public.audit_logs (
    tenant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    before_summary,
    after_summary
  ) values (
    target_room.tenant_id,
    auth.uid(),
    'ROOM_OPERATIONAL_STATE_CHANGED',
    'ROOM',
    target_room.id,
    jsonb_build_object(
      'status', target_room.operational_status,
      'version', target_room.version
    ),
    jsonb_build_object(
      'status', p_new_status,
      'reason', clean_reason,
      'version', target_room.version + 1
    )
  );

  return query
  select room.id, room.operational_status, room.version
  from public.room_inventory room
  where room.id = target_room.id;
end;
$$;

revoke all on function public.change_room_operational_state(
  uuid,
  public.room_operational_status,
  text,
  integer
) from public, anon;
grant execute on function public.change_room_operational_state(
  uuid,
  public.room_operational_status,
  text,
  integer
) to authenticated;

create or replace function public.update_tenant_branding(
  p_tenant_id uuid,
  p_thai_name text,
  p_english_name text,
  p_contact_phone text,
  p_logo_storage_path text,
  p_logo_mime_type text,
  p_logo_size_bytes bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_tenant public.tenants%rowtype;
  old_settings public.tenant_settings%rowtype;
  clean_thai_name text := btrim(coalesce(p_thai_name, ''));
  clean_english_name text := btrim(coalesce(p_english_name, ''));
  clean_phone text := nullif(regexp_replace(coalesce(p_contact_phone, ''), '[^0-9+]', '', 'g'), '');
  clean_logo_path text := nullif(btrim(coalesce(p_logo_storage_path, '')), '');
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;

  if not public.has_tenant_role(p_tenant_id, array['OWNER']::public.clinic_role[]) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if char_length(clean_thai_name) not between 1 and 200
    or char_length(clean_english_name) not between 1 and 200
  then
    raise exception using errcode = '22023', message = 'INVALID_CLINIC_NAME';
  end if;

  if clean_phone is not null and clean_phone !~ '^\+?[0-9]{8,15}$' then
    raise exception using errcode = '22023', message = 'INVALID_PHONE';
  end if;

  if clean_logo_path is not null
    and (
      split_part(clean_logo_path, '/', 1) <> p_tenant_id::text
      or split_part(clean_logo_path, '/', 2) <> 'branding'
    )
  then
    raise exception using errcode = '22023', message = 'INVALID_LOGO_PATH';
  end if;

  if p_logo_mime_type is not null and (
    clean_logo_path is null
    or p_logo_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_logo_size_bytes is null
    or p_logo_size_bytes not between 1 and 2097152
  ) then
    raise exception using errcode = '22023', message = 'INVALID_LOGO_FILE';
  end if;

  select * into old_tenant
  from public.tenants tenant
  where tenant.id = p_tenant_id
  for update;

  if old_tenant.id is null then
    raise exception using errcode = 'P0002', message = 'TENANT_NOT_FOUND';
  end if;

  select * into old_settings
  from public.tenant_settings settings
  where settings.tenant_id = p_tenant_id
  for update;

  update public.tenants
  set thai_name = clean_thai_name,
      english_name = clean_english_name
  where id = p_tenant_id;

  insert into public.tenant_settings (
    tenant_id,
    contact_phone,
    logo_storage_path
  ) values (
    p_tenant_id,
    clean_phone,
    clean_logo_path
  )
  on conflict (tenant_id) do update set
    contact_phone = excluded.contact_phone,
    logo_storage_path = excluded.logo_storage_path;

  if p_logo_mime_type is not null then
    insert into public.file_assets (
      tenant_id,
      storage_path,
      purpose,
      entity_type,
      entity_id,
      mime_type,
      size_bytes,
      uploaded_by,
      validated_at
    ) values (
      p_tenant_id,
      clean_logo_path,
      'BRANDING',
      'TENANT',
      p_tenant_id,
      p_logo_mime_type,
      p_logo_size_bytes,
      auth.uid(),
      now()
    );
  end if;

  insert into public.audit_logs (
    tenant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    before_summary,
    after_summary
  ) values (
    p_tenant_id,
    auth.uid(),
    'TENANT_BRANDING_UPDATED',
    'TENANT',
    p_tenant_id,
    jsonb_build_object(
      'thai_name', old_tenant.thai_name,
      'english_name', old_tenant.english_name,
      'contact_phone', old_settings.contact_phone,
      'logo_storage_path', old_settings.logo_storage_path
    ),
    jsonb_build_object(
      'thai_name', clean_thai_name,
      'english_name', clean_english_name,
      'contact_phone', clean_phone,
      'logo_storage_path', clean_logo_path
    )
  );
end;
$$;

revoke all on function public.update_tenant_branding(uuid, text, text, text, text, text, bigint)
  from public, anon;
grant execute on function public.update_tenant_branding(uuid, text, text, text, text, text, bigint)
  to authenticated;

comment on function public.get_room_plan(uuid, public.animal_species, date) is
  'Room planning projection. Open physical stays always override planned dates and operational state.';
comment on function public.change_room_operational_state(
  uuid,
  public.room_operational_status,
  text,
  integer
) is 'Audited room-state mutation with role, row-lock, open-stay, and optimistic-version checks.';
