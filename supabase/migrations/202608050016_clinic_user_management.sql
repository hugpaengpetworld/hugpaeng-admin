set search_path = public, extensions;

drop policy if exists memberships_insert_owner on public.tenant_memberships;
drop policy if exists memberships_update_owner on public.tenant_memberships;
drop policy if exists memberships_delete_owner on public.tenant_memberships;

create or replace function public.manage_tenant_membership(
  p_membership_id uuid,
  p_role public.clinic_role,
  p_status public.membership_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.tenant_memberships%rowtype;
  other_owner_count integer;
begin
  select * into target
  from public.tenant_memberships
  where id = p_membership_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;
  if not public.has_tenant_role(
    target.tenant_id,
    array['OWNER']::public.clinic_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if target.user_id = auth.uid() then
    raise exception using errcode = 'P0001', message = 'CANNOT_CHANGE_OWN_MEMBERSHIP';
  end if;
  if p_status not in ('ACTIVE', 'SUSPENDED', 'REVOKED') then
    raise exception using errcode = '22023', message = 'INVALID_MEMBERSHIP_STATUS';
  end if;

  if target.role = 'OWNER'
     and target.status = 'ACTIVE'
     and (p_role <> 'OWNER' or p_status <> 'ACTIVE') then
    select count(*)::integer into other_owner_count
    from public.tenant_memberships membership
    where membership.tenant_id = target.tenant_id
      and membership.id <> target.id
      and membership.role = 'OWNER'
      and membership.status = 'ACTIVE';
    if other_owner_count = 0 then
      raise exception using errcode = 'P0001', message = 'LAST_OWNER_REQUIRED';
    end if;
  end if;

  update public.tenant_memberships
  set role = p_role,
      status = p_status,
      activated_at = case
        when p_status = 'ACTIVE' then coalesce(activated_at, now())
        else activated_at
      end,
      revoked_at = case when p_status = 'REVOKED' then now() else null end
  where id = target.id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id,
    before_summary, after_summary
  ) values (
    target.tenant_id,
    auth.uid(),
    'TENANT_MEMBERSHIP_CHANGED',
    'TENANT_MEMBERSHIP',
    target.id,
    jsonb_build_object('role', target.role, 'status', target.status),
    jsonb_build_object('role', p_role, 'status', p_status)
  );
end;
$$;

revoke all on function public.manage_tenant_membership(
  uuid, public.clinic_role, public.membership_status
) from public, anon;
grant execute on function public.manage_tenant_membership(
  uuid, public.clinic_role, public.membership_status
) to authenticated;

comment on function public.manage_tenant_membership(
  uuid, public.clinic_role, public.membership_status
) is
  'OWNER-only audited membership mutation. Prevents self-lockout and removal of the final active tenant owner.';
