alter table public.tenant_memberships
  add column display_name text;

update public.tenant_memberships membership
set display_name = profile.display_name
from public.profiles profile
where profile.user_id = membership.user_id
  and membership.display_name is null;

alter table public.tenant_memberships
  add constraint tenant_memberships_display_name_valid check (
    display_name is null
    or (char_length(btrim(display_name)) between 1 and 150)
  );

create or replace function public.set_tenant_membership_display_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.display_name is null or btrim(new.display_name) = '' then
    select profile.display_name into new.display_name
    from public.profiles profile
    where profile.user_id = new.user_id;
  else
    new.display_name := btrim(new.display_name);
  end if;
  return new;
end;
$$;

create trigger tenant_memberships_set_display_name
before insert or update of user_id, display_name on public.tenant_memberships
for each row execute function public.set_tenant_membership_display_name();

create or replace function public.manage_tenant_member_profile_with_permissions(
  p_membership_id uuid,
  p_display_name text,
  p_role public.clinic_role,
  p_status public.membership_status,
  p_allowed_permissions text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.tenant_memberships%rowtype;
  normalized_display_name text := btrim(coalesce(p_display_name, ''));
begin
  if char_length(normalized_display_name) not between 1 and 150 then
    raise exception using errcode = '22023', message = 'INVALID_DISPLAY_NAME';
  end if;

  select * into target
  from public.tenant_memberships
  where id = p_membership_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;

  perform public.manage_tenant_membership_with_permissions(
    p_membership_id,
    p_role,
    p_status,
    p_allowed_permissions
  );

  if target.display_name is distinct from normalized_display_name then
    update public.tenant_memberships
    set display_name = normalized_display_name,
        updated_at = now()
    where id = target.id;

    insert into public.audit_logs (
      tenant_id, actor_user_id, action, entity_type, entity_id,
      before_summary, after_summary
    ) values (
      target.tenant_id, auth.uid(), 'TENANT_MEMBER_PROFILE_CHANGED',
      'TENANT_MEMBERSHIP', target.id,
      jsonb_build_object('display_name', target.display_name),
      jsonb_build_object('display_name', normalized_display_name)
    );
  end if;
end;
$$;

create or replace function public.revoke_tenant_membership(
  p_membership_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.tenant_memberships%rowtype;
begin
  select * into target
  from public.tenant_memberships
  where id = p_membership_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;

  perform public.manage_tenant_membership(
    target.id,
    target.role,
    'REVOKED'::public.membership_status
  );
end;
$$;

revoke all on function public.set_tenant_membership_display_name() from public, anon, authenticated;
revoke all on function public.manage_tenant_member_profile_with_permissions(uuid, text, public.clinic_role, public.membership_status, text[]) from public, anon;
revoke all on function public.revoke_tenant_membership(uuid) from public, anon;
grant execute on function public.manage_tenant_member_profile_with_permissions(uuid, text, public.clinic_role, public.membership_status, text[]) to authenticated;
grant execute on function public.revoke_tenant_membership(uuid) to authenticated;
