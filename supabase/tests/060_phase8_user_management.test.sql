begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

select has_function(
  'public', 'manage_tenant_membership',
  array['uuid', 'clinic_role', 'membership_status'],
  'audited owner membership mutation function exists'
);
select is(
  (
    select count(*)::integer from pg_policies
    where schemaname = 'public' and tablename = 'tenant_memberships'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  0,
  'membership writes cannot bypass the audited function/bootstrap path'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tenant_memberships'
      and policyname = 'memberships_select_self_or_manager'
  ),
  'members and owners retain scoped membership reads'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.manage_tenant_membership(uuid, public.clinic_role, public.membership_status)',
    'EXECUTE'
  ),
  'authenticated role can call the server-authorized function'
);
select has_function(
  'public', 'provision_tenant_member',
  array['uuid', 'uuid', 'text', 'clinic_role'],
  'transactional tenant member provisioning exists'
);
select has_function(
  'public', 'bootstrap_first_tenant_owner', array['text', 'uuid', 'text'],
  'service-only initial owner bootstrap exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.provision_tenant_member(uuid, uuid, text, public.clinic_role)',
    'EXECUTE'
  ),
  'authenticated owners can call transactional provisioning'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.bootstrap_first_tenant_owner(text, uuid, text)',
    'EXECUTE'
  ),
  'browser-authenticated users cannot bootstrap the initial owner'
);

select * from finish();
rollback;
