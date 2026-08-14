set search_path = public, extensions;

create or replace function public.is_active_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_memberships membership
    where membership.tenant_id = p_tenant_id
      and membership.user_id = auth.uid()
      and membership.status = 'ACTIVE'
  );
$$;

create or replace function public.has_tenant_role(
  p_tenant_id uuid,
  p_roles public.clinic_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_memberships membership
    where membership.tenant_id = p_tenant_id
      and membership.user_id = auth.uid()
      and membership.status = 'ACTIVE'
      and membership.role = any(p_roles)
  );
$$;

create or replace function public.shares_active_tenant_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_memberships mine
    join public.tenant_memberships theirs on theirs.tenant_id = mine.tenant_id
    where mine.user_id = auth.uid()
      and mine.status = 'ACTIVE'
      and theirs.user_id = p_user_id
      and theirs.status in ('INVITED', 'ACTIVE')
  );
$$;

revoke all on function public.is_active_tenant_member(uuid) from public;
revoke all on function public.has_tenant_role(uuid, public.clinic_role[]) from public;
revoke all on function public.shares_active_tenant_with(uuid) from public;
grant execute on function public.is_active_tenant_member(uuid) to authenticated;
grant execute on function public.has_tenant_role(uuid, public.clinic_role[]) to authenticated;
grant execute on function public.shares_active_tenant_with(uuid) to authenticated;

create or replace function public.can_transition_booking_status(
  p_from public.booking_status,
  p_to public.booking_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_from
    when 'PENDING_APPROVAL' then p_to in (
      'APPROVED_AWAITING_DEPOSIT', 'CONFIRMED', 'REJECTED', 'CANCELLED_NO_REFUND'
    )
    when 'APPROVED_AWAITING_DEPOSIT' then p_to in (
      'CONFIRMED', 'EXPIRED_PAYMENT', 'CANCELLED_NO_REFUND'
    )
    when 'CONFIRMED' then p_to in ('CHECKED_IN', 'NO_SHOW', 'CANCELLED_NO_REFUND')
    when 'CHECKED_IN' then p_to = 'CHECKED_OUT'
    else false
  end;
$$;

create or replace function public.enforce_booking_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if not public.can_transition_booking_status(old.status, new.status) then
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_STATUS_TRANSITION';
    end if;

    new.version = old.version + 1;
    insert into public.audit_logs (
      tenant_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      before_summary,
      after_summary
    ) values (
      old.tenant_id,
      auth.uid(),
      'BOOKING_STATUS_CHANGED',
      'BOOKING',
      old.id,
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status)
    );
  end if;
  return new;
end;
$$;

create trigger bookings_enforce_status_transition
before update of status on public.bookings
for each row execute function public.enforce_booking_status_transition();

create or replace function public.next_booking_code(
  p_tenant_id uuid,
  p_room_code text,
  p_check_in_date date
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_value integer;
begin
  insert into public.daily_sequences (
    tenant_id,
    sequence_kind,
    sequence_date,
    scope_key,
    last_value
  ) values (
    p_tenant_id,
    'BOOKING',
    p_check_in_date,
    p_room_code,
    1
  )
  on conflict (tenant_id, sequence_kind, sequence_date, scope_key)
  do update set
    last_value = public.daily_sequences.last_value + 1,
    updated_at = now()
  returning last_value into next_value;

  if next_value > 99 then
    raise exception using
      errcode = '22003',
      message = 'BOOKING_CODE_SEQUENCE_EXHAUSTED';
  end if;

  return format(
    'BMP-%s-%s-%s',
    to_char(p_check_in_date, 'YYYYMMDD'),
    p_room_code,
    lpad(next_value::text, 2, '0')
  );
end;
$$;

revoke all on function public.next_booking_code(uuid, text, date) from public, anon, authenticated;

create or replace function public.allocate_planned_room(
  p_booking_id uuid,
  p_room_id uuid,
  p_allocation_status public.allocation_status default 'HOLD'
)
returns table (allocation_id uuid, booking_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_tenant_id uuid;
  target_species public.animal_species;
  current_booking_code text;
  current_booking_status public.booking_status;
  check_in_date date;
  check_out_date date;
  selected_room_code text;
  selected_room_species public.animal_species;
  created_allocation_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;

  if p_allocation_status not in ('HOLD', 'RESERVED') then
    raise exception using errcode = '22023', message = 'INVALID_ALLOCATION_STATUS';
  end if;

  select
    booking.tenant_id,
    booking.species,
    booking.booking_code,
    booking.status,
    booking_group.check_in_date,
    booking_group.check_out_date
  into
    target_tenant_id,
    target_species,
    current_booking_code,
    current_booking_status,
    check_in_date,
    check_out_date
  from public.bookings booking
  join public.booking_groups booking_group
    on booking_group.tenant_id = booking.tenant_id
   and booking_group.id = booking.booking_group_id
  where booking.id = p_booking_id
  for update of booking;

  if target_tenant_id is null then
    raise exception using errcode = 'P0002', message = 'BOOKING_NOT_FOUND';
  end if;

  if not public.has_tenant_role(
    target_tenant_id,
    array['OWNER', 'DOCTOR', 'STAFF']::public.clinic_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if (p_allocation_status = 'HOLD' and current_booking_status not in (
      'PENDING_APPROVAL', 'APPROVED_AWAITING_DEPOSIT'
    ))
    or (p_allocation_status = 'RESERVED' and current_booking_status <> 'CONFIRMED')
  then
    raise exception using errcode = 'P0001', message = 'INVALID_STATUS_TRANSITION';
  end if;

  select room.room_code, room.species
  into selected_room_code, selected_room_species
  from public.room_inventory room
  where room.id = p_room_id
    and room.tenant_id = target_tenant_id
  for update;

  if selected_room_code is null then
    raise exception using errcode = 'P0002', message = 'ROOM_NOT_FOUND';
  end if;

  if selected_room_species <> target_species then
    raise exception using errcode = '22023', message = 'ROOM_SPECIES_MISMATCH';
  end if;

  if exists (
    select 1
    from public.room_allocations allocation
    where allocation.booking_id = p_booking_id
      and allocation.status in ('HOLD', 'RESERVED')
  ) then
    raise exception using errcode = '23P01', message = 'BOOKING_ALREADY_ALLOCATED';
  end if;

  if current_booking_code is null then
    current_booking_code := public.next_booking_code(
      target_tenant_id,
      selected_room_code,
      check_in_date
    );
  end if;

  begin
    insert into public.room_allocations (
      tenant_id,
      booking_id,
      room_id,
      start_date,
      end_date,
      status,
      created_by
    ) values (
      target_tenant_id,
      p_booking_id,
      p_room_id,
      check_in_date,
      check_out_date,
      p_allocation_status,
      auth.uid()
    ) returning id into created_allocation_id;
  exception
    when exclusion_violation then
      raise exception using errcode = '23P01', message = 'ROOM_UNAVAILABLE';
  end;

  update public.bookings
  set room_id = p_room_id,
      booking_code = current_booking_code
  where id = p_booking_id;

  insert into public.audit_logs (
    tenant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    after_summary
  ) values (
    target_tenant_id,
    auth.uid(),
    'ROOM_ALLOCATED',
    'BOOKING',
    p_booking_id,
    jsonb_build_object(
      'allocation_id', created_allocation_id,
      'room_code', selected_room_code,
      'start_date', check_in_date,
      'end_date', check_out_date,
      'status', p_allocation_status
    )
  );

  return query select created_allocation_id, current_booking_code;
end;
$$;

revoke all on function public.allocate_planned_room(uuid, uuid, public.allocation_status)
  from public, anon;
grant execute on function public.allocate_planned_room(uuid, uuid, public.allocation_status)
  to authenticated;

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.customers enable row level security;
alter table public.pets enable row level security;
alter table public.booking_groups enable row level security;
alter table public.room_inventory enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_pets enable row level security;
alter table public.room_allocations enable row level security;
alter table public.room_stays enable row level security;
alter table public.daily_sequences enable row level security;
alter table public.audit_logs enable row level security;
alter table public.outbox_events enable row level security;

create policy tenants_select_member on public.tenants
for select to authenticated
using (public.is_active_tenant_member(id));

create policy tenants_update_owner on public.tenants
for update to authenticated
using (public.has_tenant_role(id, array['OWNER']::public.clinic_role[]))
with check (public.has_tenant_role(id, array['OWNER']::public.clinic_role[]));

create policy profiles_select_shared_tenant on public.profiles
for select to authenticated
using (user_id = auth.uid() or public.shares_active_tenant_with(user_id));

create policy profiles_update_self on public.profiles
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy memberships_select_self_or_owner on public.tenant_memberships
for select to authenticated
using (
  user_id = auth.uid()
  or public.has_tenant_role(tenant_id, array['OWNER']::public.clinic_role[])
);

create policy memberships_insert_owner on public.tenant_memberships
for insert to authenticated
with check (public.has_tenant_role(tenant_id, array['OWNER']::public.clinic_role[]));

create policy memberships_update_owner on public.tenant_memberships
for update to authenticated
using (public.has_tenant_role(tenant_id, array['OWNER']::public.clinic_role[]))
with check (public.has_tenant_role(tenant_id, array['OWNER']::public.clinic_role[]));

create policy memberships_delete_owner on public.tenant_memberships
for delete to authenticated
using (public.has_tenant_role(tenant_id, array['OWNER']::public.clinic_role[]));

create policy customers_member_all on public.customers
for all to authenticated
using (public.is_active_tenant_member(tenant_id))
with check (public.is_active_tenant_member(tenant_id));

create policy pets_member_all on public.pets
for all to authenticated
using (public.is_active_tenant_member(tenant_id))
with check (public.is_active_tenant_member(tenant_id));

create policy booking_groups_member_all on public.booking_groups
for all to authenticated
using (public.is_active_tenant_member(tenant_id))
with check (public.is_active_tenant_member(tenant_id));

create policy rooms_select_member on public.room_inventory
for select to authenticated
using (public.is_active_tenant_member(tenant_id));

create policy rooms_mutate_clinic_roles on public.room_inventory
for all to authenticated
using (public.has_tenant_role(
  tenant_id,
  array['OWNER', 'DOCTOR', 'STAFF']::public.clinic_role[]
))
with check (public.has_tenant_role(
  tenant_id,
  array['OWNER', 'DOCTOR', 'STAFF']::public.clinic_role[]
));

create policy bookings_member_all on public.bookings
for all to authenticated
using (public.is_active_tenant_member(tenant_id))
with check (public.is_active_tenant_member(tenant_id));

create policy booking_pets_member_all on public.booking_pets
for all to authenticated
using (public.is_active_tenant_member(tenant_id))
with check (public.is_active_tenant_member(tenant_id));

create policy allocations_select_member on public.room_allocations
for select to authenticated
using (public.is_active_tenant_member(tenant_id));

create policy stays_select_member on public.room_stays
for select to authenticated
using (public.is_active_tenant_member(tenant_id));

create policy audit_logs_select_owner on public.audit_logs
for select to authenticated
using (public.has_tenant_role(tenant_id, array['OWNER']::public.clinic_role[]));

comment on function public.allocate_planned_room(uuid, uuid, public.allocation_status) is
  'Authenticated atomic room allocation. Tenant derives from the booking; callers cannot supply tenant_id.';
