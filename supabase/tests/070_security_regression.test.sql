begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

select is(
  (
    select count(*)::integer
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and not relation.relrowsecurity
  ),
  0,
  'every public application table has RLS enabled'
);

select is(
  (
    select count(*)::integer
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prosecdef
      and not exists (
        select 1
        from unnest(coalesce(procedure.proconfig, array[]::text[])) setting
        where setting like 'search_path=%'
      )
  ),
  0,
  'every security definer function fixes its search path'
);

select is(
  (
    select count(*)::integer
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prosecdef
      and has_function_privilege('anon', procedure.oid, 'EXECUTE')
  ),
  0,
  'anonymous clients cannot execute security definer functions directly'
);

select ok(
  has_table_privilege('authenticated', 'public.room_inventory', 'SELECT'),
  'authenticated users can reach room inventory RLS policies'
);

select ok(
  has_table_privilege('authenticated', 'public.customers', 'SELECT'),
  'authenticated users can reach customer RLS policies'
);

select ok(
  not has_table_privilege('authenticated', 'public.room_inventory', 'INSERT'),
  'room creation remains restricted to transactional functions'
);

select ok(
  has_table_privilege('authenticated', 'public.file_assets', 'INSERT'),
  'authorized uploads can reach the file asset insert policy'
);

select * from finish();
rollback;
