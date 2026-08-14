begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

select has_function(
  'public',
  'create_next_room',
  array['uuid', 'animal_species'],
  'owner-only sequential room creation RPC exists'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'room_inventory'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  0,
  'room inventory writes cannot bypass audited RPCs'
);

select is(
  has_function_privilege(
    'anon',
    'public.create_next_room(uuid, public.animal_species)',
    'EXECUTE'
  ),
  false,
  'anonymous users cannot create rooms'
);

select * from finish();
rollback;
