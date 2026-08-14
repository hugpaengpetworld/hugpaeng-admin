begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

select has_type('public', 'platform_role', 'platform role enum exists');
select has_type('public', 'support_grant_status', 'support grant state enum exists');
select has_table('public', 'platform_roles', 'platform role assignments exist');
select has_table('public', 'support_access_grants', 'support grants exist');
select has_function(
  'public', 'has_platform_role', array['platform_role[]'],
  'platform authorization predicate exists'
);
select has_function(
  'public', 'has_active_support_access', array['uuid', 'text'],
  'tenant/scope/time support predicate exists'
);
select has_function(
  'public', 'create_support_access_grant',
  array['uuid', 'uuid', 'text', 'text', 'text[]', 'timestamp with time zone', 'timestamp with time zone'],
  'audited grant creation function exists'
);
select has_function(
  'public', 'revoke_support_access_grant', array['uuid', 'text'],
  'immediate revocation function exists'
);
select has_function(
  'public', 'record_support_access_use', array['uuid'],
  'support usage audit function exists'
);
select has_function(
  'public', 'refresh_support_grant_statuses', array[]::text[],
  'scheduled lifecycle refresh exists'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.platform_roles'::regclass),
  'platform roles have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.support_access_grants'::regclass),
  'support grants have RLS enabled'
);
select is(
  (
    select count(*)::integer from pg_policies
    where schemaname = 'public' and tablename = 'support_access_grants'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  0,
  'grant writes cannot bypass security definer functions'
);
select is(
  (
    select count(*)::integer from pg_policies
    where schemaname = 'public' and tablename = 'platform_roles'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  0,
  'platform role writes have no browser policy'
);
select fk_ok(
  'public', 'audit_logs', 'support_grant_id',
  'public', 'support_access_grants', 'id',
  'audit grant identifiers are referentially enforced'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'customers'
      and policyname = 'customers_select_scoped_support'
  ),
  'customer access requires an explicit support scope'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'receipts'
      and policyname = 'receipts_select_scoped_support'
  ),
  'finance access requires an explicit support scope'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pet_health_profiles'
      and policyname = 'pet_health_profiles_select_scoped_support'
  ),
  'health access requires an explicit support scope'
);

select * from finish();
rollback;
