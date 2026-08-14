set search_path = public, extensions;

create or replace function public.provision_tenant_member(
  p_tenant_id uuid,
  p_user_id uuid,
  p_display_name text,
  p_role public.clinic_role
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership_id uuid;
  clean_display_name text := nullif(btrim(coalesce(p_display_name, '')), '');
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
  if clean_display_name is null or char_length(clean_display_name) > 150 then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  if exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = p_tenant_id
      and membership.user_id = p_user_id
  ) then
    raise exception using errcode = '23505', message = 'USER_ALREADY_MEMBER';
  end if;

  insert into public.profiles (user_id, display_name)
  values (p_user_id, clean_display_name)
  on conflict (user_id) do update
    set display_name = excluded.display_name;

  insert into public.tenant_memberships (
    tenant_id, user_id, role, status, activated_at
  ) values (
    p_tenant_id, p_user_id, p_role, 'ACTIVE', now()
  ) returning id into membership_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    p_tenant_id,
    auth.uid(),
    'TENANT_USER_INVITED',
    'TENANT_MEMBERSHIP',
    membership_id,
    jsonb_build_object('role', p_role, 'status', 'ACTIVE')
  );

  return membership_id;
end;
$$;

revoke all on function public.provision_tenant_member(
  uuid, uuid, text, public.clinic_role
) from public, anon;
grant execute on function public.provision_tenant_member(
  uuid, uuid, text, public.clinic_role
) to authenticated;

comment on function public.provision_tenant_member(
  uuid, uuid, text, public.clinic_role
) is
  'OWNER-only transactional profile, membership, and audit provisioning after a server-side Auth invitation.';

create or replace function public.bootstrap_first_tenant_owner(
  p_tenant_slug text,
  p_user_id uuid,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_tenant_id uuid;
  membership_id uuid;
  clean_display_name text := nullif(btrim(coalesce(p_display_name, '')), '');
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if clean_display_name is null or char_length(clean_display_name) > 150 then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  select tenant.id into target_tenant_id
  from public.tenants tenant
  where tenant.slug = p_tenant_slug
  for update;
  if target_tenant_id is null then
    raise exception using errcode = 'P0002', message = 'TENANT_NOT_FOUND';
  end if;

  select membership.id into membership_id
  from public.tenant_memberships membership
  where membership.tenant_id = target_tenant_id
    and membership.user_id = p_user_id
  for update;

  if exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id
      and membership.role = 'OWNER'
      and membership.status = 'ACTIVE'
      and membership.user_id <> p_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'INITIAL_OWNER_ALREADY_EXISTS';
  end if;

  insert into public.profiles (user_id, display_name)
  values (p_user_id, clean_display_name)
  on conflict (user_id) do update
    set display_name = excluded.display_name;

  if membership_id is null then
    insert into public.tenant_memberships (
      tenant_id, user_id, role, status, activated_at
    ) values (
      target_tenant_id, p_user_id, 'OWNER', 'ACTIVE', now()
    ) returning id into membership_id;
  else
    update public.tenant_memberships
    set role = 'OWNER', status = 'ACTIVE',
        activated_at = coalesce(activated_at, now()), revoked_at = null
    where id = membership_id;
  end if;

  if not exists (
    select 1 from public.audit_logs audit
    where audit.tenant_id = target_tenant_id
      and audit.action = 'INITIAL_OWNER_BOOTSTRAPPED'
      and audit.entity_type = 'TENANT_MEMBERSHIP'
      and audit.entity_id = membership_id
  ) then
    insert into public.audit_logs (
      tenant_id, action, entity_type, entity_id, after_summary
    ) values (
      target_tenant_id,
      'INITIAL_OWNER_BOOTSTRAPPED',
      'TENANT_MEMBERSHIP',
      membership_id,
      jsonb_build_object('role', 'OWNER', 'status', 'ACTIVE')
    );
  end if;

  return membership_id;
end;
$$;

revoke all on function public.bootstrap_first_tenant_owner(
  text, uuid, text
) from public, anon, authenticated;
grant execute on function public.bootstrap_first_tenant_owner(
  text, uuid, text
) to service_role;

comment on function public.bootstrap_first_tenant_owner(text, uuid, text) is
  'Service-only idempotent bootstrap for the first OWNER. Refuses to replace another active owner and records an audit fact.';
