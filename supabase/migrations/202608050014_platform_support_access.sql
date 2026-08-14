set search_path = public, extensions;

create type public.platform_role as enum ('PLATFORM_OWNER', 'SUPPORT_AGENT');
create type public.support_grant_status as enum ('SCHEDULED', 'ACTIVE', 'EXPIRED', 'REVOKED');

create table public.platform_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role public.platform_role not null,
  is_active boolean not null default true,
  assigned_by uuid references public.profiles(user_id) on delete restrict,
  revoked_by uuid references public.profiles(user_id) on delete restrict,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, role),
  constraint platform_role_revocation_consistent check (
    (is_active and revoked_at is null and revoked_by is null)
    or (not is_active and revoked_at is not null and revoked_by is not null)
  )
);

create table public.support_access_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  support_user_id uuid not null references public.profiles(user_id) on delete restrict,
  requested_by uuid not null references public.profiles(user_id) on delete restrict,
  approved_by uuid not null references public.profiles(user_id) on delete restrict,
  reason text not null check (char_length(reason) between 10 and 500),
  ticket_reference text not null check (char_length(ticket_reference) between 1 and 100),
  scopes text[] not null,
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  status public.support_grant_status not null,
  revoked_by uuid references public.profiles(user_id) on delete restrict,
  revoked_at timestamptz,
  revocation_reason text check (
    revocation_reason is null or char_length(revocation_reason) between 1 and 500
  ),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint support_access_window_valid check (
    expires_at > starts_at and expires_at <= starts_at + interval '24 hours'
  ),
  constraint support_access_scopes_nonempty check (cardinality(scopes) > 0),
  constraint support_access_requires_overview check ('TENANT_OVERVIEW' = any(scopes)),
  constraint support_access_scopes_allowlisted check (
    scopes <@ array[
      'TENANT_OVERVIEW',
      'BOOKING_READ',
      'CUSTOMER_READ',
      'ROOM_READ',
      'FINANCE_READ',
      'STERILIZATION_READ',
      'HEALTH_READ',
      'AUDIT_READ'
    ]::text[]
  ),
  constraint support_access_revocation_consistent check (
    (status = 'REVOKED' and revoked_at is not null and revoked_by is not null and revocation_reason is not null)
    or (status <> 'REVOKED' and revoked_at is null and revoked_by is null and revocation_reason is null)
  )
);

alter table public.audit_logs
  add constraint audit_logs_support_grant_id_fkey
  foreign key (support_grant_id)
  references public.support_access_grants(id)
  on delete restrict;

create index platform_roles_user_active_idx
  on public.platform_roles (user_id, role) where is_active;
create index support_grants_user_window_idx
  on public.support_access_grants (support_user_id, status, starts_at, expires_at);
create index support_grants_tenant_created_idx
  on public.support_access_grants (tenant_id, created_at desc);

create trigger platform_roles_set_updated_at
before update on public.platform_roles
for each row execute function public.set_updated_at();
create trigger support_access_grants_set_updated_at
before update on public.support_access_grants
for each row execute function public.set_updated_at();

create or replace function public.has_platform_role(
  p_roles public.platform_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_roles role_assignment
    where role_assignment.user_id = auth.uid()
      and role_assignment.is_active
      and role_assignment.role = any(p_roles)
  );
$$;

create or replace function public.has_active_support_access(
  p_tenant_id uuid,
  p_required_scope text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.support_access_grants support_grant
    join public.platform_roles role_assignment
      on role_assignment.user_id = support_grant.support_user_id
     and role_assignment.role = 'SUPPORT_AGENT'
     and role_assignment.is_active
    where support_grant.tenant_id = p_tenant_id
      and support_grant.support_user_id = auth.uid()
      and support_grant.status = 'ACTIVE'
      and now() >= support_grant.starts_at
      and now() < support_grant.expires_at
      and p_required_scope = any(support_grant.scopes)
  );
$$;

revoke all on function public.has_platform_role(public.platform_role[]) from public;
revoke all on function public.has_active_support_access(uuid, text) from public;
grant execute on function public.has_platform_role(public.platform_role[]) to authenticated;
grant execute on function public.has_active_support_access(uuid, text) to authenticated;

alter table public.platform_roles enable row level security;
alter table public.support_access_grants enable row level security;

create policy platform_roles_select_self_or_platform_owner
on public.platform_roles
for select to authenticated
using (
  user_id = auth.uid()
  or public.has_platform_role(array['PLATFORM_OWNER']::public.platform_role[])
);

create policy support_grants_select_authorized
on public.support_access_grants
for select to authenticated
using (
  support_user_id = auth.uid()
  or public.has_platform_role(array['PLATFORM_OWNER']::public.platform_role[])
  or public.has_tenant_role(tenant_id, array['OWNER']::public.clinic_role[])
);

create policy tenants_select_scoped_support
on public.tenants
for select to authenticated
using (public.has_active_support_access(id, 'TENANT_OVERVIEW'));

create policy tenants_select_platform_owner
on public.tenants
for select to authenticated
using (public.has_platform_role(array['PLATFORM_OWNER']::public.platform_role[]));

create policy profiles_select_platform_owner
on public.profiles
for select to authenticated
using (public.has_platform_role(array['PLATFORM_OWNER']::public.platform_role[]));

create policy tenant_settings_select_scoped_support
on public.tenant_settings
for select to authenticated
using (public.has_active_support_access(tenant_id, 'TENANT_OVERVIEW'));

create policy customers_select_scoped_support
on public.customers
for select to authenticated
using (public.has_active_support_access(tenant_id, 'CUSTOMER_READ'));
create policy pets_select_scoped_support
on public.pets
for select to authenticated
using (public.has_active_support_access(tenant_id, 'CUSTOMER_READ'));
create policy booking_groups_select_scoped_support
on public.booking_groups
for select to authenticated
using (public.has_active_support_access(tenant_id, 'BOOKING_READ'));
create policy bookings_select_scoped_support
on public.bookings
for select to authenticated
using (public.has_active_support_access(tenant_id, 'BOOKING_READ'));
create policy booking_pets_select_scoped_support
on public.booking_pets
for select to authenticated
using (public.has_active_support_access(tenant_id, 'BOOKING_READ'));
create policy rooms_select_scoped_support
on public.room_inventory
for select to authenticated
using (public.has_active_support_access(tenant_id, 'ROOM_READ'));
create policy allocations_select_scoped_support
on public.room_allocations
for select to authenticated
using (public.has_active_support_access(tenant_id, 'ROOM_READ'));
create policy stays_select_scoped_support
on public.room_stays
for select to authenticated
using (public.has_active_support_access(tenant_id, 'ROOM_READ'));
create policy payments_select_scoped_support
on public.payments
for select to authenticated
using (public.has_active_support_access(tenant_id, 'FINANCE_READ'));
create policy booking_charges_select_scoped_support
on public.booking_charges
for select to authenticated
using (public.has_active_support_access(tenant_id, 'FINANCE_READ'));
create policy receipts_select_scoped_support
on public.receipts
for select to authenticated
using (public.has_active_support_access(tenant_id, 'FINANCE_READ'));
create policy receipt_items_select_scoped_support
on public.receipt_items
for select to authenticated
using (public.has_active_support_access(tenant_id, 'FINANCE_READ'));
create policy sterilization_appointments_select_scoped_support
on public.sterilization_appointments
for select to authenticated
using (public.has_active_support_access(tenant_id, 'STERILIZATION_READ'));
create policy sterilization_holidays_select_scoped_support
on public.sterilization_holidays
for select to authenticated
using (public.has_active_support_access(tenant_id, 'STERILIZATION_READ'));
create policy pet_health_profiles_select_scoped_support
on public.pet_health_profiles
for select to authenticated
using (public.has_active_support_access(tenant_id, 'HEALTH_READ'));
create policy file_assets_select_scoped_support
on public.file_assets
for select to authenticated
using (public.has_active_support_access(tenant_id, 'HEALTH_READ'));
create policy audit_logs_select_scoped_support
on public.audit_logs
for select to authenticated
using (public.has_active_support_access(tenant_id, 'AUDIT_READ'));

create or replace function public.create_support_access_grant(
  p_tenant_id uuid,
  p_support_user_id uuid,
  p_reason text,
  p_ticket_reference text,
  p_scopes text[],
  p_starts_at timestamptz,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  grant_id uuid;
  grant_status public.support_grant_status;
begin
  if not public.has_platform_role(array['PLATFORM_OWNER']::public.platform_role[]) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if not exists (
    select 1 from public.platform_roles role_assignment
    where role_assignment.user_id = p_support_user_id
      and role_assignment.role = 'SUPPORT_AGENT'
      and role_assignment.is_active
  ) then
    raise exception using errcode = '22023', message = 'SUPPORT_AGENT_REQUIRED';
  end if;
  if p_expires_at <= p_starts_at
     or p_expires_at > p_starts_at + interval '24 hours'
     or p_expires_at <= now() then
    raise exception using errcode = '22023', message = 'INVALID_SUPPORT_WINDOW';
  end if;
  if nullif(trim(p_reason), '') is null or char_length(trim(p_reason)) < 10 then
    raise exception using errcode = '22023', message = 'SUPPORT_REASON_REQUIRED';
  end if;
  if nullif(trim(p_ticket_reference), '') is null then
    raise exception using errcode = '22023', message = 'TICKET_REFERENCE_REQUIRED';
  end if;
  if cardinality(p_scopes) = 0
     or not ('TENANT_OVERVIEW' = any(p_scopes))
     or not (
    p_scopes <@ array[
      'TENANT_OVERVIEW', 'BOOKING_READ', 'CUSTOMER_READ', 'ROOM_READ',
      'FINANCE_READ', 'STERILIZATION_READ', 'HEALTH_READ', 'AUDIT_READ'
    ]::text[]
  ) then
    raise exception using errcode = '22023', message = 'INVALID_SUPPORT_SCOPE';
  end if;

  grant_status := case when p_starts_at <= now() then 'ACTIVE'::public.support_grant_status
    else 'SCHEDULED'::public.support_grant_status end;
  insert into public.support_access_grants (
    tenant_id,
    support_user_id,
    requested_by,
    approved_by,
    reason,
    ticket_reference,
    scopes,
    starts_at,
    expires_at,
    status
  ) values (
    p_tenant_id,
    p_support_user_id,
    auth.uid(),
    auth.uid(),
    trim(p_reason),
    trim(p_ticket_reference),
    array(select distinct unnest(p_scopes)),
    p_starts_at,
    p_expires_at,
    grant_status
  ) returning id into grant_id;

  insert into public.audit_logs (
    tenant_id,
    actor_user_id,
    support_grant_id,
    action,
    entity_type,
    entity_id,
    after_summary
  ) values (
    p_tenant_id,
    auth.uid(),
    grant_id,
    'SUPPORT_ACCESS_GRANTED',
    'SUPPORT_ACCESS_GRANT',
    grant_id,
    jsonb_build_object(
      'support_user_id', p_support_user_id,
      'ticket_reference', trim(p_ticket_reference),
      'scopes', p_scopes,
      'starts_at', p_starts_at,
      'expires_at', p_expires_at
    )
  );
  return grant_id;
end;
$$;

revoke all on function public.create_support_access_grant(
  uuid, uuid, text, text, text[], timestamptz, timestamptz
) from public, anon;
grant execute on function public.create_support_access_grant(
  uuid, uuid, text, text, text[], timestamptz, timestamptz
) to authenticated;

create or replace function public.revoke_support_access_grant(
  p_grant_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.support_access_grants%rowtype;
begin
  select * into target from public.support_access_grants where id = p_grant_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'NOT_FOUND'; end if;
  if not (
    public.has_platform_role(array['PLATFORM_OWNER']::public.platform_role[])
    or public.has_tenant_role(target.tenant_id, array['OWNER']::public.clinic_role[])
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if target.status in ('EXPIRED', 'REVOKED') then
    raise exception using errcode = 'P0001', message = 'SUPPORT_GRANT_NOT_ACTIVE';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'REASON_REQUIRED';
  end if;

  update public.support_access_grants
  set status = 'REVOKED', revoked_by = auth.uid(), revoked_at = now(),
      revocation_reason = trim(p_reason)
  where id = target.id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, support_grant_id, action, entity_type,
    entity_id, before_summary, after_summary
  ) values (
    target.tenant_id,
    auth.uid(),
    target.id,
    'SUPPORT_ACCESS_REVOKED',
    'SUPPORT_ACCESS_GRANT',
    target.id,
    jsonb_build_object('status', target.status),
    jsonb_build_object('status', 'REVOKED', 'reason', trim(p_reason))
  );
end;
$$;

revoke all on function public.revoke_support_access_grant(uuid, text) from public, anon;
grant execute on function public.revoke_support_access_grant(uuid, text) to authenticated;

create or replace function public.record_support_access_use(p_grant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.support_access_grants%rowtype;
begin
  select * into target from public.support_access_grants where id = p_grant_id for update;
  if not found
     or target.support_user_id <> auth.uid()
     or target.status <> 'ACTIVE'
     or now() < target.starts_at
     or now() >= target.expires_at then
    raise exception using errcode = '42501', message = 'SUPPORT_ACCESS_INACTIVE';
  end if;

  update public.support_access_grants set last_used_at = now() where id = target.id;
  insert into public.audit_logs (
    tenant_id, actor_user_id, support_grant_id, action, entity_type,
    entity_id, after_summary
  ) values (
    target.tenant_id,
    auth.uid(),
    target.id,
    'SUPPORT_ACCESS_USED',
    'SUPPORT_ACCESS_GRANT',
    target.id,
    jsonb_build_object('scopes', target.scopes)
  );
end;
$$;

revoke all on function public.record_support_access_use(uuid) from public, anon;
grant execute on function public.record_support_access_use(uuid) to authenticated;

create or replace function public.refresh_support_grant_statuses()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  with changed_rows as (
    update public.support_access_grants
    set status = case
      when expires_at <= now() then 'EXPIRED'::public.support_grant_status
      else 'ACTIVE'::public.support_grant_status
    end
    where (status = 'SCHEDULED' and starts_at <= now())
       or (status = 'ACTIVE' and expires_at <= now())
    returning id
  )
  select count(*)::integer into changed from changed_rows;
  return changed;
end;
$$;

revoke all on function public.refresh_support_grant_statuses() from public, anon, authenticated;
grant execute on function public.refresh_support_grant_statuses() to service_role;

comment on table public.support_access_grants is
  'Explicit, scoped, time-limited support access. No write/refund/user/secret scope exists.';
comment on function public.has_active_support_access(uuid, text) is
  'RLS predicate: requires active SUPPORT_AGENT role, ACTIVE grant, current time window, tenant, and exact scope.';
