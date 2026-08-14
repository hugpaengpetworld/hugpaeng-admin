create type public.booking_charge_type as enum (
  'FOOD', 'MEDICINE', 'IV_FLUIDS', 'BLOOD_TEST', 'OTHER'
);
create type public.checkout_payment_method as enum (
  'CASH', 'TRANSFER', 'PROMPTPAY', 'CARD', 'OTHER', 'NOT_SPECIFIED'
);
create type public.receipt_status as enum ('ISSUED', 'VOID');
create type public.receipt_artifact_status as enum ('PENDING', 'READY', 'FAILED');

alter table public.payments
drop constraint if exists payments_payment_type_check;

alter table public.payments
add constraint payments_payment_type_check
  check (payment_type in ('DEPOSIT', 'CHECKOUT', 'REFUND')),
add column payment_method public.checkout_payment_method,
add column notes text,
add column source_account_name_normalized text,
add column source_account_last4 char(4),
add column matching_original_payment_id uuid,
add column refund_account_name text,
add column refund_account_number_masked text,
add column refunded_at timestamptz,
add column refunded_by uuid references public.profiles(user_id) on delete set null,
add foreign key (tenant_id, matching_original_payment_id)
  references public.payments(tenant_id, id) on delete restrict,
add constraint payments_source_account_last4_valid check (
  source_account_last4 is null or source_account_last4 ~ '^[0-9]{4}$'
),
add constraint payments_refund_consistent check (
  (payment_type = 'REFUND'
    and status = 'REFUNDED'
    and matching_original_payment_id is not null
    and refund_account_name is not null
    and refund_account_number_masked is not null
    and refunded_at is not null
    and refunded_by is not null)
  or payment_type <> 'REFUND'
);

alter table public.room_stays
add column check_out_notes text;

create table public.booking_charges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_id uuid not null,
  room_stay_id uuid not null,
  charge_type public.booking_charge_type not null,
  description text,
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  unit_price_satang integer not null check (unit_price_satang > 0),
  amount_satang integer not null check (amount_satang > 0),
  service_date date not null,
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, booking_id)
    references public.bookings(tenant_id, id) on delete restrict,
  foreign key (tenant_id, room_stay_id)
    references public.room_stays(tenant_id, id) on delete restrict,
  constraint booking_charge_amount_matches check (
    amount_satang = round(quantity * unit_price_satang)::integer
  ),
  constraint booking_charge_description_valid check (
    char_length(coalesce(description, '')) <= 150
    and (charge_type <> 'OTHER' or nullif(btrim(description), '') is not null)
  )
);

create index booking_charges_tenant_booking_idx
  on public.booking_charges (tenant_id, booking_id, service_date, created_at);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_id uuid not null,
  room_stay_id uuid not null,
  receipt_no text not null,
  status public.receipt_status not null default 'ISSUED',
  issued_at timestamptz not null,
  issued_by uuid not null references public.profiles(user_id) on delete restrict,
  reissued_from_receipt_id uuid,
  clinic_thai_name text not null,
  clinic_english_name text not null,
  clinic_phone text,
  customer_name text not null,
  customer_phone text not null,
  pet_summary text not null,
  room_summary text not null,
  actual_checked_in_at timestamptz not null,
  actual_checked_out_at timestamptz not null,
  quoted_nights smallint not null check (quoted_nights > 0),
  lodging_total_satang integer not null check (lodging_total_satang >= 0),
  extra_charges_satang integer not null check (extra_charges_satang >= 0),
  total_satang integer not null check (total_satang >= 0),
  deposit_satang integer not null check (deposit_satang >= 0),
  amount_due_satang integer not null check (amount_due_satang >= 0),
  paid_at_checkout_satang integer not null check (paid_at_checkout_satang >= 0),
  refund_due_satang integer not null check (refund_due_satang >= 0),
  payment_method public.checkout_payment_method not null,
  payment_status text not null check (payment_status in ('PAID', 'REFUND_DUE')),
  notes text,
  artifact_status public.receipt_artifact_status not null default 'PENDING',
  artifact_generation integer not null default 1 check (artifact_generation > 0),
  artifact_error_code text,
  voided_at timestamptz,
  voided_by uuid references public.profiles(user_id) on delete restrict,
  void_reason text,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, receipt_no),
  foreign key (tenant_id, booking_id)
    references public.bookings(tenant_id, id) on delete restrict,
  foreign key (tenant_id, room_stay_id)
    references public.room_stays(tenant_id, id) on delete restrict,
  foreign key (tenant_id, reissued_from_receipt_id)
    references public.receipts(tenant_id, id) on delete restrict,
  constraint receipt_totals_consistent check (
    total_satang = lodging_total_satang + extra_charges_satang
    and amount_due_satang = greatest(total_satang - deposit_satang, 0)
    and refund_due_satang = greatest(deposit_satang - total_satang, 0)
    and paid_at_checkout_satang = amount_due_satang
  ),
  constraint receipt_void_consistent check (
    (status = 'VOID' and voided_at is not null and voided_by is not null
      and nullif(btrim(void_reason), '') is not null)
    or (status = 'ISSUED' and voided_at is null and voided_by is null and void_reason is null)
  )
);

create unique index receipts_one_active_per_booking_uidx
  on public.receipts (tenant_id, booking_id) where status = 'ISSUED';
create index receipts_tenant_issued_idx
  on public.receipts (tenant_id, issued_at desc);

create table public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  receipt_id uuid not null,
  booking_id uuid not null,
  line_no smallint not null check (line_no > 0),
  item_type text not null check (item_type in ('LODGING', 'EXTRA')),
  item_name text not null,
  description text,
  pet_summary text,
  room_summary text,
  quantity numeric(10, 2) not null check (quantity > 0),
  unit text not null,
  unit_price_satang integer not null check (unit_price_satang >= 0),
  amount_satang integer not null check (amount_satang >= 0),
  service_date date not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (receipt_id, line_no),
  foreign key (tenant_id, receipt_id)
    references public.receipts(tenant_id, id) on delete restrict,
  foreign key (tenant_id, booking_id)
    references public.bookings(tenant_id, id) on delete restrict,
  constraint receipt_item_amount_matches check (
    amount_satang = round(quantity * unit_price_satang)::integer
  )
);

create index receipt_items_tenant_receipt_idx
  on public.receipt_items (tenant_id, receipt_id, line_no);

alter table public.booking_charges enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;

create policy booking_charges_select_member on public.booking_charges
for select to authenticated
using (public.is_active_tenant_member(tenant_id));

create policy receipts_select_member on public.receipts
for select to authenticated
using (public.is_active_tenant_member(tenant_id));

create policy receipt_items_select_member on public.receipt_items
for select to authenticated
using (public.is_active_tenant_member(tenant_id));

create or replace function public.protect_receipt_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - array[
    'status', 'artifact_status', 'artifact_generation', 'artifact_error_code',
    'voided_at', 'voided_by', 'void_reason'
  ]) is distinct from (to_jsonb(old) - array[
    'status', 'artifact_status', 'artifact_generation', 'artifact_error_code',
    'voided_at', 'voided_by', 'void_reason'
  ]) then
    raise exception using errcode = '55000', message = 'RECEIPT_SNAPSHOT_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger receipts_protect_snapshot
before update on public.receipts
for each row execute function public.protect_receipt_snapshot();

create or replace function public.protect_receipt_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception using errcode = '55000', message = 'RECEIPT_ITEM_IMMUTABLE';
end;
$$;

create trigger receipt_items_protect_snapshot
before update or delete on public.receipt_items
for each row execute function public.protect_receipt_item();

create or replace function public.next_receipt_number(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  sequence_day date := (now() at time zone 'Asia/Bangkok')::date;
  next_value integer;
begin
  insert into public.daily_sequences (
    tenant_id, sequence_kind, sequence_date, scope_key, last_value
  ) values (
    p_tenant_id, 'RECEIPT', sequence_day, '', 1
  )
  on conflict (tenant_id, sequence_kind, sequence_date, scope_key)
  do update set last_value = public.daily_sequences.last_value + 1,
                updated_at = now()
  returning last_value into next_value;

  if next_value > 9999 then
    raise exception using errcode = '22003', message = 'RECEIPT_SEQUENCE_EXHAUSTED';
  end if;

  return format(
    'BMP-RCP-%s-%s', to_char(sequence_day, 'YYYYMMDD'),
    lpad(next_value::text, 4, '0')
  );
end;
$$;

revoke all on function public.next_receipt_number(uuid)
  from public, anon, authenticated;

create or replace function public.check_in_booking(
  p_booking_id uuid,
  p_room_id uuid,
  p_deposit_satang integer,
  p_notes text,
  p_expected_version integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_tenant_id uuid;
  target_booking public.bookings%rowtype;
  target_room public.room_inventory%rowtype;
  target_group public.booking_groups%rowtype;
  current_allocation public.room_allocations%rowtype;
  existing_deposit integer := 0;
  claimed_key_id uuid;
  existing_key public.idempotency_keys%rowtype;
  request_hash text;
  stay_id uuid;
  response_payload jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  if p_deposit_satang is null
    or p_deposit_satang < 0
    or p_expected_version is null
    or char_length(coalesce(p_notes, '')) > 1500
    or char_length(coalesce(p_idempotency_key, '')) not between 16 and 200
  then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  select booking.tenant_id into target_tenant_id
  from public.bookings booking where booking.id = p_booking_id;
  if target_tenant_id is null then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;
  if not public.has_tenant_role(
    target_tenant_id, array['OWNER', 'DOCTOR', 'STAFF']::public.clinic_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  request_hash := encode(extensions.digest(
    convert_to(concat_ws('|', p_booking_id, p_room_id, p_deposit_satang,
      coalesce(p_notes, ''), p_expected_version), 'UTF8'), 'sha256'
  ), 'hex');
  insert into public.idempotency_keys (
    tenant_id, scope, idempotency_key, request_hash, expires_at
  ) values (
    target_tenant_id, 'CHECK_IN', p_idempotency_key, request_hash,
    now() + interval '24 hours'
  ) on conflict (tenant_id, scope, idempotency_key) do nothing
  returning id into claimed_key_id;
  if claimed_key_id is null then
    select * into existing_key from public.idempotency_keys key
    where key.tenant_id = target_tenant_id and key.scope = 'CHECK_IN'
      and key.idempotency_key = p_idempotency_key
    for update;
    if existing_key.request_hash <> request_hash then
      raise exception using errcode = '22023', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return existing_key.result || jsonb_build_object('idempotencyReplay', true);
  end if;

  select * into target_booking from public.bookings booking
  where booking.id = p_booking_id for update;
  if target_booking.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;
  if target_booking.status <> 'CONFIRMED' then
    raise exception using errcode = 'P0001', message = 'INVALID_STATUS_TRANSITION';
  end if;
  select * into target_group from public.booking_groups booking_group
  where booking_group.id = target_booking.booking_group_id;

  select * into target_room from public.room_inventory room
  where room.id = p_room_id and room.tenant_id = target_tenant_id for update;
  if target_room.id is null then
    raise exception using errcode = 'P0002', message = 'ROOM_NOT_FOUND';
  end if;
  if target_room.species <> target_booking.species then
    raise exception using errcode = '22023', message = 'ROOM_SPECIES_MISMATCH';
  end if;
  if target_room.operational_status <> 'AVAILABLE' then
    raise exception using errcode = '55000', message = 'ROOM_NOT_READY';
  end if;
  if exists (
    select 1 from public.room_stays stay where stay.tenant_id = target_tenant_id
      and stay.room_id = p_room_id and stay.checked_out_at is null
  ) then
    raise exception using errcode = '23P01', message = 'OPEN_STAY_EXISTS';
  end if;

  select * into current_allocation from public.room_allocations allocation
  where allocation.tenant_id = target_tenant_id
    and allocation.booking_id = p_booking_id
    and allocation.status in ('HOLD', 'RESERVED')
  order by allocation.created_at desc limit 1 for update;

  if current_allocation.id is null or current_allocation.room_id <> p_room_id then
    if current_allocation.id is not null then
      update public.room_allocations set status = 'RELEASED', released_at = now(),
        release_reason = 'ROOM_CHANGED_AT_CHECK_IN'
      where id = current_allocation.id;
    end if;
    begin
      insert into public.room_allocations (
        tenant_id, booking_id, room_id, start_date, end_date, status, created_by
      ) values (
        target_tenant_id, p_booking_id, p_room_id, target_group.check_in_date,
        target_group.check_out_date, 'RESERVED', auth.uid()
      );
    exception when exclusion_violation then
      raise exception using errcode = '23P01', message = 'ROOM_UNAVAILABLE';
    end;
  else
    update public.room_allocations set status = 'RESERVED'
    where id = current_allocation.id;
  end if;

  select coalesce(sum(payment.amount_satang), 0)::integer into existing_deposit
  from public.payments payment
  where payment.tenant_id = target_tenant_id and payment.booking_id = p_booking_id
    and payment.payment_type = 'DEPOSIT' and payment.status = 'VERIFIED';
  if p_deposit_satang < existing_deposit then
    raise exception using errcode = '22023', message = 'DEPOSIT_BELOW_VERIFIED';
  end if;
  if p_deposit_satang > 0 then
    insert into public.payments (
      tenant_id, booking_id, payment_type, amount_satang, status,
      submitted_at, verified_at, verified_by, notes
    ) values (
      target_tenant_id, p_booking_id, 'DEPOSIT', p_deposit_satang, 'VERIFIED',
      now(), now(), auth.uid(), 'ยอดมัดจำรวมที่ยืนยัน ณ เช็กอิน'
    ) on conflict (tenant_id, booking_id, payment_type)
    do update set amount_satang = excluded.amount_satang, status = 'VERIFIED',
      submitted_at = coalesce(public.payments.submitted_at, now()),
      verified_at = now(), verified_by = auth.uid(), notes = excluded.notes;
  end if;

  insert into public.room_stays (
    tenant_id, booking_id, room_id, checked_in_at, check_in_notes,
    deposit_satang, checked_in_by
  ) values (
    target_tenant_id, p_booking_id, p_room_id, now(),
    nullif(btrim(coalesce(p_notes, '')), ''), p_deposit_satang, auth.uid()
  ) returning id into stay_id;

  update public.bookings set room_id = p_room_id, status = 'CHECKED_IN'
  where id = p_booking_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    target_tenant_id, auth.uid(), 'BOOKING_CHECKED_IN', 'ROOM_STAY', stay_id,
    jsonb_build_object('booking_id', p_booking_id, 'room_id', p_room_id,
      'deposit_satang', p_deposit_satang)
  );

  response_payload := jsonb_build_object('bookingId', p_booking_id, 'stayId', stay_id,
    'roomId', p_room_id, 'status', 'CHECKED_IN');
  update public.idempotency_keys set result = response_payload where id = claimed_key_id;
  return response_payload;
end;
$$;

revoke all on function public.check_in_booking(
  uuid, uuid, integer, text, integer, text
) from public, anon;
grant execute on function public.check_in_booking(
  uuid, uuid, integer, text, integer, text
) to authenticated;

create or replace function public.preview_checkout(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_booking public.bookings%rowtype;
  target_group public.booking_groups%rowtype;
  target_stay public.room_stays%rowtype;
  extra_total integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  select * into target_booking from public.bookings booking
  where booking.id = p_booking_id;
  if target_booking.id is null then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;
  if not public.is_active_tenant_member(target_booking.tenant_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  select * into target_group from public.booking_groups booking_group
  where booking_group.id = target_booking.booking_group_id;
  select * into target_stay from public.room_stays stay
  where stay.tenant_id = target_booking.tenant_id and stay.booking_id = p_booking_id
    and stay.checked_out_at is null;
  if target_stay.id is null then
    raise exception using errcode = 'P0002', message = 'OPEN_STAY_NOT_FOUND';
  end if;
  select coalesce(sum(charge.amount_satang), 0)::integer into extra_total
  from public.booking_charges charge
  where charge.tenant_id = target_booking.tenant_id and charge.booking_id = p_booking_id;

  return jsonb_build_object(
    'bookingId', p_booking_id,
    'lodgingTotalSatang', target_booking.lodging_total_satang,
    'extraChargesSatang', extra_total,
    'totalSatang', target_booking.lodging_total_satang + extra_total,
    'depositSatang', target_stay.deposit_satang,
    'amountDueSatang', greatest(
      target_booking.lodging_total_satang + extra_total - target_stay.deposit_satang, 0
    ),
    'refundDueSatang', greatest(
      target_stay.deposit_satang - target_booking.lodging_total_satang - extra_total, 0
    ),
    'plannedCheckOutDate', target_group.check_out_date,
    'earlyCheckout', target_group.check_out_date > (now() at time zone 'Asia/Bangkok')::date
  );
end;
$$;

revoke all on function public.preview_checkout(uuid) from public, anon;
grant execute on function public.preview_checkout(uuid) to authenticated;

comment on table public.booking_charges is
  'Audited checkout charge facts. Application writes only through transactional functions.';
comment on table public.receipts is
  'Immutable receipt headers. Only status/void and recoverable artifact metadata may change.';
comment on table public.receipt_items is
  'Immutable receipt line snapshots; reads never join mutable customer or pet names.';
