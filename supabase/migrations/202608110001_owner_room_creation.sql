alter table public.room_inventory
drop constraint if exists room_code_matches_species;

alter table public.room_inventory
add constraint room_code_matches_species check (
  (species = 'CAT' and room_code ~ '^CAT(0[1-9]|[1-9][0-9]{1,3})$')
  or (species = 'DOG' and room_code ~ '^DOG(0[1-9]|[1-9][0-9]{1,3})$')
);

create or replace function public.create_next_room(
  p_tenant_id uuid,
  p_species public.animal_species
)
returns table (
  room_id uuid,
  room_code text,
  species public.animal_species,
  operational_status public.room_operational_status,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_number integer;
  created_room public.room_inventory%rowtype;
  room_prefix text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;

  if not public.has_tenant_role(
    p_tenant_id,
    array['OWNER']::public.clinic_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if p_species not in ('CAT', 'DOG') then
    raise exception using errcode = '22023', message = 'INVALID_ROOM_SPECIES';
  end if;

  -- Serialize room-number generation per tenant and species without locking
  -- unrelated clinics or the other species inventory.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_tenant_id::text || ':' || p_species::text, 0)
  );

  room_prefix := case p_species when 'CAT' then 'CAT' else 'DOG' end;

  select coalesce(max(substring(room.room_code from 4)::integer), 0) + 1
  into next_number
  from public.room_inventory room
  where room.tenant_id = p_tenant_id
    and room.species = p_species;

  if next_number > 9999 then
    raise exception using errcode = '22003', message = 'ROOM_NUMBER_EXHAUSTED';
  end if;

  insert into public.room_inventory (tenant_id, room_code, species)
  values (
    p_tenant_id,
    room_prefix || lpad(next_number::text, 2, '0'),
    p_species
  )
  returning * into created_room;

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
    'ROOM_CREATED',
    'ROOM',
    created_room.id,
    jsonb_build_object(
      'room_code', created_room.room_code,
      'species', created_room.species,
      'operational_status', created_room.operational_status,
      'version', created_room.version
    )
  );

  return query
  select
    created_room.id,
    created_room.room_code,
    created_room.species,
    created_room.operational_status,
    created_room.version;
end;
$$;

revoke all on function public.create_next_room(uuid, public.animal_species)
  from public, anon;
grant execute on function public.create_next_room(uuid, public.animal_species)
  to authenticated;

comment on function public.create_next_room(uuid, public.animal_species) is
  'OWNER-only audited room creation with tenant/species-scoped serialization and automatic sequential room codes.';
