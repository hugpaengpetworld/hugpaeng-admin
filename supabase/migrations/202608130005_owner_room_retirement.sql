alter table public.room_inventory
add column retired_at timestamptz,
add column retired_by uuid references public.profiles(user_id) on delete restrict,
add column retirement_reason text;

alter table public.room_inventory
add constraint room_retirement_consistent check (
  (retired_at is null and retired_by is null and retirement_reason is null)
  or (
    retired_at is not null
    and retired_by is not null
    and retirement_reason is not null
    and char_length(retirement_reason) between 3 and 500
    and operational_status = 'DISABLED'
  )
);

create index room_inventory_active_tenant_species_idx
  on public.room_inventory (tenant_id, species, room_code)
  where retired_at is null;

create or replace function public.retire_room(
  p_room_id uuid,
  p_expected_version integer,
  p_reason text
)
returns table (
  room_id uuid,
  room_code text,
  species public.animal_species,
  retired_at timestamptz,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_room public.room_inventory%rowtype;
  clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
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
    array['OWNER']::public.clinic_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if target_room.retired_at is not null then
    raise exception using errcode = '22023', message = 'ROOM_ALREADY_RETIRED';
  end if;

  if target_room.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  if clean_reason is null or char_length(clean_reason) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'RETIREMENT_REASON_REQUIRED';
  end if;

  if exists (
    select 1
    from public.room_stays stay
    where stay.tenant_id = target_room.tenant_id
      and stay.room_id = target_room.id
      and stay.checked_out_at is null
  ) then
    raise exception using errcode = '55000', message = 'OPEN_STAY_EXISTS';
  end if;

  if exists (
    select 1
    from public.room_allocations allocation
    where allocation.tenant_id = target_room.tenant_id
      and allocation.room_id = target_room.id
      and allocation.status in ('HOLD', 'RESERVED')
  ) then
    raise exception using errcode = '55000', message = 'ACTIVE_ROOM_ALLOCATION_EXISTS';
  end if;

  update public.room_inventory room
  set operational_status = 'DISABLED',
      notes = clean_reason,
      retired_at = now(),
      retired_by = auth.uid(),
      retirement_reason = clean_reason,
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
    'ROOM_RETIRED',
    'ROOM',
    target_room.id,
    jsonb_build_object(
      'room_code', target_room.room_code,
      'species', target_room.species,
      'operational_status', target_room.operational_status,
      'version', target_room.version
    ),
    jsonb_build_object(
      'room_code', target_room.room_code,
      'species', target_room.species,
      'operational_status', 'DISABLED',
      'retirement_reason', clean_reason,
      'version', target_room.version + 1
    )
  );

  return query
  select room.id, room.room_code, room.species, room.retired_at, room.version
  from public.room_inventory room
  where room.id = target_room.id;
end;
$$;

revoke all on function public.retire_room(uuid, integer, text)
  from public, anon;
grant execute on function public.retire_room(uuid, integer, text)
  to authenticated;

comment on function public.retire_room(uuid, integer, text) is
  'OWNER-only audited soft deletion for unused rooms. Historical booking and stay references are preserved.';

do $$
declare
  definition text;
  old_fragment text := $fragment$
  where room.tenant_id = p_tenant_id
    and room.species = p_species
  order by room.room_code;$fragment$;
  new_fragment text := $fragment$
  where room.tenant_id = p_tenant_id
    and room.species = p_species
    and room.retired_at is null
  order by room.room_code;$fragment$;
begin
  select pg_get_functiondef(
    'public.get_room_plan(uuid,public.animal_species,date)'::regprocedure
  ) into definition;
  if position(old_fragment in definition) = 0 then
    raise exception 'GET_ROOM_PLAN_RETIREMENT_TARGET_NOT_FOUND';
  end if;
  execute replace(definition, old_fragment, new_fragment);
end;
$$;

do $$
declare
  definition text;
  old_fragment text := $fragment$
  if target_room.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;$fragment$;
  new_fragment text := $fragment$
  if target_room.retired_at is not null then
    raise exception using errcode = '55000', message = 'ROOM_RETIRED';
  end if;

  if target_room.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;$fragment$;
begin
  select pg_get_functiondef(
    'public.change_room_operational_state(uuid,public.room_operational_status,text,integer)'::regprocedure
  ) into definition;
  if position(old_fragment in definition) = 0 then
    raise exception 'CHANGE_ROOM_STATE_RETIREMENT_TARGET_NOT_FOUND';
  end if;
  execute replace(definition, old_fragment, new_fragment);
end;
$$;

comment on column public.room_inventory.retired_at is
  'Soft-deletion timestamp. Retired rooms are excluded from planning but remain for historical references.';
comment on column public.room_inventory.retired_by is
  'OWNER user who retired the room.';
comment on column public.room_inventory.retirement_reason is
  'Required audited reason for retiring a room from active inventory.';
