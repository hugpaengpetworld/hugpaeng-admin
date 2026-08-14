begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

select has_column('public', 'room_inventory', 'version', 'rooms have optimistic versions');
select has_function(
  'public',
  'get_room_plan',
  array['uuid', 'animal_species', 'date'],
  'room planning projection exists'
);
select has_function(
  'public',
  'change_room_operational_state',
  array['uuid', 'room_operational_status', 'text', 'integer'],
  'audited room state RPC exists'
);
select has_function(
  'public',
  'update_tenant_branding',
  array['uuid', 'text', 'text', 'text', 'text', 'text', 'bigint'],
  'owner-only branding RPC exists'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'room_inventory'
      and cmd in ('UPDATE', 'ALL')
  ),
  0,
  'room updates cannot bypass the audited RPC'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'file_assets'
      and policyname = 'file_assets_insert_by_purpose'
      and cmd = 'INSERT'
  ),
  1,
  'file metadata inserts are restricted by purpose and role'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'tenant_assets_insert_by_purpose'
      and cmd = 'INSERT'
  ),
  1,
  'storage uploads are restricted by purpose and role'
);

select * from finish();
rollback;
