create type public.reschedule_status as enum ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

alter table public.bookings
add column reviewed_at timestamptz,
add column reviewed_by uuid references public.profiles(user_id) on delete set null,
add column rejection_reason text,
add column confirmed_at timestamptz;

alter table public.outbox_events
add column processing_started_at timestamptz;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_id uuid not null,
  payment_type text not null default 'DEPOSIT' check (payment_type = 'DEPOSIT'),
  amount_satang integer not null check (amount_satang > 0),
  status public.payment_status not null,
  evidence_asset_id uuid,
  submitted_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, booking_id, payment_type),
  foreign key (tenant_id, booking_id)
    references public.bookings(tenant_id, id) on delete restrict,
  foreign key (tenant_id, evidence_asset_id)
    references public.file_assets(tenant_id, id) on delete restrict,
  constraint payment_submission_consistent check (
    (status in ('SUBMITTED', 'VERIFIED') and submitted_at is not null)
    or status not in ('SUBMITTED', 'VERIFIED')
  ),
  constraint payment_verification_consistent check (
    (status = 'VERIFIED' and verified_at is not null and verified_by is not null)
    or status <> 'VERIFIED'
  )
);

create index payments_tenant_status_idx on public.payments (tenant_id, status, created_at);

create table public.reschedule_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_group_id uuid not null,
  old_check_in_date date not null,
  old_check_out_date date not null,
  new_check_in_date date not null,
  new_check_out_date date not null,
  status public.reschedule_status not null default 'PENDING',
  customer_reason text,
  decision_reason text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, booking_group_id)
    references public.booking_groups(tenant_id, id) on delete restrict,
  constraint reschedule_old_dates_valid check (old_check_out_date > old_check_in_date),
  constraint reschedule_new_dates_valid check (new_check_out_date > new_check_in_date),
  constraint reschedule_decision_consistent check (
    (status in ('APPROVED', 'REJECTED') and decided_at is not null and decided_by is not null)
    or status in ('PENDING', 'CANCELLED')
  )
);

create unique index reschedule_one_pending_per_group_uidx
  on public.reschedule_requests (tenant_id, booking_group_id)
  where status = 'PENDING';
create index reschedule_tenant_status_idx
  on public.reschedule_requests (tenant_id, status, requested_at desc);

create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

create trigger reschedule_requests_set_updated_at
before update on public.reschedule_requests
for each row execute function public.set_updated_at();

alter table public.payments enable row level security;
alter table public.reschedule_requests enable row level security;

drop policy if exists tenant_settings_mutate_owner on public.tenant_settings;

create policy payments_select_member on public.payments
for select to authenticated
using (public.is_active_tenant_member(tenant_id));

create policy reschedule_requests_select_member on public.reschedule_requests
for select to authenticated
using (public.is_active_tenant_member(tenant_id));

revoke execute on function public.update_tenant_branding(
  uuid, text, text, text, text, text, bigint
) from authenticated;

create or replace function public.update_tenant_configuration(
  p_tenant_id uuid,
  p_thai_name text,
  p_english_name text,
  p_contact_phone text,
  p_logo_storage_path text,
  p_logo_mime_type text,
  p_logo_size_bytes bigint,
  p_promptpay_display_value text,
  p_bank_name text,
  p_bank_account_name text,
  p_bank_account_number_masked text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_promptpay text := nullif(btrim(coalesce(p_promptpay_display_value, '')), '');
  clean_bank_name text := nullif(btrim(coalesce(p_bank_name, '')), '');
  clean_account_name text := nullif(btrim(coalesce(p_bank_account_name, '')), '');
  clean_masked_number text := nullif(btrim(coalesce(p_bank_account_number_masked, '')), '');
begin
  if not public.has_tenant_role(p_tenant_id, array['OWNER']::public.clinic_role[]) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if coalesce(char_length(clean_promptpay), 0) > 100
    or coalesce(char_length(clean_bank_name), 0) > 100
    or coalesce(char_length(clean_account_name), 0) > 150
    or coalesce(char_length(clean_masked_number), 0) > 50
  then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  perform public.update_tenant_branding(
    p_tenant_id, p_thai_name, p_english_name, p_contact_phone,
    p_logo_storage_path, p_logo_mime_type, p_logo_size_bytes
  );

  update public.tenant_settings
  set promptpay_display_value = clean_promptpay,
      bank_name = clean_bank_name,
      bank_account_name = clean_account_name,
      bank_account_number_masked = clean_masked_number
  where tenant_id = p_tenant_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    p_tenant_id, auth.uid(), 'PAYMENT_INSTRUCTIONS_UPDATED', 'TENANT', p_tenant_id,
    jsonb_build_object(
      'has_promptpay', clean_promptpay is not null,
      'has_bank_instructions', clean_bank_name is not null
    )
  );
end;
$$;

revoke all on function public.update_tenant_configuration(
  uuid, text, text, text, text, text, bigint, text, text, text, text
) from public, anon;
grant execute on function public.update_tenant_configuration(
  uuid, text, text, text, text, text, bigint, text, text, text, text
) to authenticated;

create or replace function public.review_booking(
  p_booking_id uuid,
  p_decision text,
  p_reason text,
  p_expected_version integer
)
returns table (
  booking_id uuid,
  status public.booking_status,
  payment_status public.payment_status,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_booking public.bookings%rowtype;
  target_channel public.booking_channel;
  target_line_user_id text;
  clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  deadline timestamptz;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;

  select booking.*
  into target_booking
  from public.bookings booking
  where booking.id = p_booking_id
  for update of booking;

  if target_booking.id is null then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;
  if not public.has_tenant_role(
    target_booking.tenant_id,
    array['OWNER', 'DOCTOR', 'STAFF']::public.clinic_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if target_booking.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;
  if target_booking.status <> 'PENDING_APPROVAL' then
    raise exception using errcode = 'P0001', message = 'INVALID_STATUS_TRANSITION';
  end if;

  select booking_group.channel, customer.line_user_id
  into target_channel, target_line_user_id
  from public.booking_groups booking_group
  join public.customers customer
    on customer.tenant_id = booking_group.tenant_id
   and customer.id = booking_group.customer_id
  where booking_group.tenant_id = target_booking.tenant_id
    and booking_group.id = target_booking.booking_group_id;
  if p_decision not in ('APPROVE', 'REJECT') then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  if p_decision = 'REJECT' then
    if clean_reason is null then
      raise exception using errcode = '22023', message = 'REASON_REQUIRED';
    end if;
    update public.bookings
    set status = 'REJECTED',
        reviewed_at = now(),
        reviewed_by = auth.uid(),
        rejection_reason = clean_reason
    where id = target_booking.id;

    update public.room_allocations
    set status = 'RELEASED',
        released_at = now(),
        release_reason = 'BOOKING_REJECTED'
    where tenant_id = target_booking.tenant_id
      and booking_id = target_booking.id
      and status in ('HOLD', 'RESERVED');

    if target_line_user_id is not null then
      insert into public.outbox_events (
        tenant_id, event_type, aggregate_type, aggregate_id,
        idempotency_key, payload
      ) values (
        target_booking.tenant_id,
        'LINE_BOOKING_REJECTED',
        'BOOKING',
        target_booking.id,
        'line-booking-rejected:' || target_booking.id::text,
        jsonb_build_object(
          'lineUserId', target_line_user_id,
          'bookingCode', target_booking.booking_code,
          'reason', clean_reason
        )
      ) on conflict (tenant_id, idempotency_key) do nothing;
    end if;
  elsif target_channel = 'LINE' then
    if nullif(btrim(coalesce(target_line_user_id, '')), '') is null then
      raise exception using errcode = '22023', message = 'LINE_ID_REQUIRED';
    end if;
    deadline := now() + interval '1 hour';
    update public.bookings
    set status = 'APPROVED_AWAITING_DEPOSIT',
        payment_status = 'WAITING',
        deposit_deadline_at = deadline,
        reviewed_at = now(),
        reviewed_by = auth.uid(),
        rejection_reason = null
    where id = target_booking.id;

    insert into public.payments (
      tenant_id, booking_id, payment_type, amount_satang, status
    ) values (
      target_booking.tenant_id, target_booking.id, 'DEPOSIT', 50000, 'WAITING'
    );

    insert into public.outbox_events (
      tenant_id, event_type, aggregate_type, aggregate_id,
      idempotency_key, payload
    ) values (
      target_booking.tenant_id,
      'LINE_DEPOSIT_REQUIRED',
      'BOOKING',
      target_booking.id,
      'line-deposit-required:' || target_booking.id::text,
      jsonb_build_object(
        'lineUserId', target_line_user_id,
        'bookingCode', target_booking.booking_code,
        'amountSatang', 50000,
        'deadlineAt', deadline
      )
    ) on conflict (tenant_id, idempotency_key) do nothing;
  else
    update public.bookings
    set status = 'CONFIRMED',
        payment_status = 'NOT_REQUIRED',
        confirmed_at = now(),
        reviewed_at = now(),
        reviewed_by = auth.uid(),
        rejection_reason = null
    where id = target_booking.id;

    update public.room_allocations
    set status = 'RESERVED'
    where tenant_id = target_booking.tenant_id
      and booking_id = target_booking.id
      and status = 'HOLD';
  end if;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id,
    before_summary, after_summary
  ) values (
    target_booking.tenant_id,
    auth.uid(),
    case when p_decision = 'APPROVE' then 'BOOKING_REVIEW_APPROVED' else 'BOOKING_REVIEW_REJECTED' end,
    'BOOKING',
    target_booking.id,
    jsonb_build_object('status', target_booking.status, 'version', target_booking.version),
    jsonb_build_object('decision', p_decision, 'reason', clean_reason)
  );

  return query
  select booking.id, booking.status, booking.payment_status, booking.version
  from public.bookings booking where booking.id = target_booking.id;
end;
$$;

revoke all on function public.review_booking(uuid, text, text, integer)
  from public, anon;
grant execute on function public.review_booking(uuid, text, text, integer)
  to authenticated;

create or replace function public.submit_deposit_evidence(
  p_tenant_slug text,
  p_booking_code text,
  p_phone text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_booking public.bookings%rowtype;
  target_payment public.payments%rowtype;
  created_asset_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select booking.* into target_booking
  from public.bookings booking
  join public.booking_groups booking_group
    on booking_group.tenant_id = booking.tenant_id
   and booking_group.id = booking.booking_group_id
  join public.customers customer
    on customer.tenant_id = booking_group.tenant_id
   and customer.id = booking_group.customer_id
  join public.tenants tenant
    on tenant.id = booking.tenant_id
  where booking.booking_code = upper(btrim(p_booking_code))
    and customer.phone = public.normalize_phone(p_phone)
    and tenant.slug = p_tenant_slug
  for update of booking;

  if target_booking.id is null then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;
  if target_booking.status <> 'APPROVED_AWAITING_DEPOSIT' then
    raise exception using errcode = 'P0001', message = 'INVALID_STATUS_TRANSITION';
  end if;
  if target_booking.deposit_deadline_at <= now() then
    raise exception using errcode = 'P0001', message = 'PAYMENT_DEADLINE_EXPIRED';
  end if;
  if split_part(p_storage_path, '/', 1) <> target_booking.tenant_id::text
    or split_part(p_storage_path, '/', 2) <> 'payment-evidence'
    or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
    or p_size_bytes not between 1 and 10485760
  then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  select * into target_payment
  from public.payments payment
  where payment.tenant_id = target_booking.tenant_id
    and payment.booking_id = target_booking.id
    and payment.payment_type = 'DEPOSIT'
  for update;
  if target_payment.id is null then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;
  if target_payment.status not in ('WAITING', 'SUBMITTED') then
    raise exception using errcode = 'P0001', message = 'INVALID_STATUS_TRANSITION';
  end if;

  insert into public.file_assets (
    tenant_id, storage_path, purpose, entity_type, entity_id,
    mime_type, size_bytes, validated_at
  ) values (
    target_booking.tenant_id, p_storage_path, 'PAYMENT_EVIDENCE',
    'PAYMENT', target_payment.id, p_mime_type, p_size_bytes, now()
  ) returning id into created_asset_id;

  update public.payments
  set status = 'SUBMITTED',
      evidence_asset_id = created_asset_id,
      submitted_at = now()
  where id = target_payment.id;

  update public.bookings
  set payment_status = 'SUBMITTED'
  where id = target_booking.id;

  insert into public.audit_logs (
    tenant_id, action, entity_type, entity_id, after_summary
  ) values (
    target_booking.tenant_id,
    'DEPOSIT_EVIDENCE_SUBMITTED',
    'PAYMENT',
    target_payment.id,
    jsonb_build_object('booking_code', target_booking.booking_code)
  );
end;
$$;

revoke all on function public.submit_deposit_evidence(text, text, text, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.submit_deposit_evidence(text, text, text, text, text, bigint)
  to service_role;

create or replace function public.verify_deposit(
  p_payment_id uuid,
  p_expected_booking_version integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_payment public.payments%rowtype;
  target_booking public.bookings%rowtype;
  target_line_user_id text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;

  select * into target_payment from public.payments payment
  where payment.id = p_payment_id for update;
  if target_payment.id is null then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;
  if not public.has_tenant_role(
    target_payment.tenant_id,
    array['OWNER', 'STAFF']::public.clinic_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select booking.*
  into target_booking
  from public.bookings booking
  where booking.id = target_payment.booking_id
  for update of booking;

  select customer.line_user_id into target_line_user_id
  from public.booking_groups booking_group
  join public.customers customer
    on customer.tenant_id = booking_group.tenant_id
   and customer.id = booking_group.customer_id
  where booking_group.tenant_id = target_booking.tenant_id
    and booking_group.id = target_booking.booking_group_id;

  if target_booking.version <> p_expected_booking_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;
  if target_booking.status <> 'APPROVED_AWAITING_DEPOSIT'
    or target_payment.status <> 'SUBMITTED'
  then
    raise exception using errcode = 'P0001', message = 'INVALID_STATUS_TRANSITION';
  end if;
  if target_booking.deposit_deadline_at <= now() then
    raise exception using errcode = 'P0001', message = 'PAYMENT_DEADLINE_EXPIRED';
  end if;
  if target_payment.amount_satang <> 50000 then
    raise exception using errcode = '22023', message = 'PAYMENT_AMOUNT_INVALID';
  end if;

  update public.payments
  set status = 'VERIFIED', verified_at = now(), verified_by = auth.uid()
  where id = target_payment.id;

  update public.bookings
  set status = 'CONFIRMED', payment_status = 'VERIFIED', confirmed_at = now()
  where id = target_booking.id;

  update public.room_allocations
  set status = 'RESERVED'
  where tenant_id = target_booking.tenant_id
    and booking_id = target_booking.id
    and status = 'HOLD';

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    target_booking.tenant_id, auth.uid(), 'DEPOSIT_VERIFIED', 'PAYMENT',
    target_payment.id, jsonb_build_object('amount_satang', target_payment.amount_satang)
  );

  if target_line_user_id is not null then
    insert into public.outbox_events (
      tenant_id, event_type, aggregate_type, aggregate_id,
      idempotency_key, payload
    ) values (
      target_booking.tenant_id, 'LINE_BOOKING_CONFIRMED', 'BOOKING',
      target_booking.id, 'line-booking-confirmed:' || target_booking.id::text,
      jsonb_build_object(
        'lineUserId', target_line_user_id,
        'bookingCode', target_booking.booking_code
      )
    ) on conflict (tenant_id, idempotency_key) do nothing;
  end if;
end;
$$;

revoke all on function public.verify_deposit(uuid, integer) from public, anon;
grant execute on function public.verify_deposit(uuid, integer) to authenticated;

create or replace function public.expire_due_line_deposits(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  due_booking record;
  expired_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if p_limit not between 1 and 500 then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  for due_booking in
    select booking.id, booking.tenant_id, booking.booking_code, customer.line_user_id
    from public.bookings booking
    join public.booking_groups booking_group
      on booking_group.tenant_id = booking.tenant_id
     and booking_group.id = booking.booking_group_id
    join public.customers customer
      on customer.tenant_id = booking_group.tenant_id
     and customer.id = booking_group.customer_id
    where booking.status = 'APPROVED_AWAITING_DEPOSIT'
      and booking.deposit_deadline_at <= now()
    order by booking.deposit_deadline_at
    for update of booking skip locked
    limit p_limit
  loop
    update public.bookings
    set status = 'EXPIRED_PAYMENT', payment_status = 'EXPIRED'
    where id = due_booking.id;

    update public.payments
    set status = 'EXPIRED'
    where tenant_id = due_booking.tenant_id
      and booking_id = due_booking.id
      and status in ('WAITING', 'SUBMITTED');

    update public.room_allocations
    set status = 'EXPIRED', released_at = now(), release_reason = 'PAYMENT_DEADLINE_EXPIRED'
    where tenant_id = due_booking.tenant_id
      and booking_id = due_booking.id
      and status in ('HOLD', 'RESERVED');

    insert into public.audit_logs (
      tenant_id, action, entity_type, entity_id, after_summary
    ) values (
      due_booking.tenant_id, 'LINE_DEPOSIT_EXPIRED', 'BOOKING', due_booking.id,
      jsonb_build_object('booking_code', due_booking.booking_code)
    );

    if due_booking.line_user_id is not null then
      insert into public.outbox_events (
        tenant_id, event_type, aggregate_type, aggregate_id,
        idempotency_key, payload
      ) values (
        due_booking.tenant_id, 'LINE_DEPOSIT_EXPIRED', 'BOOKING', due_booking.id,
        'line-deposit-expired:' || due_booking.id::text,
        jsonb_build_object(
          'lineUserId', due_booking.line_user_id,
          'bookingCode', due_booking.booking_code
        )
      ) on conflict (tenant_id, idempotency_key) do nothing;
    end if;
    expired_count := expired_count + 1;
  end loop;

  return expired_count;
end;
$$;

revoke all on function public.expire_due_line_deposits(integer)
  from public, anon, authenticated;
grant execute on function public.expire_due_line_deposits(integer) to service_role;

create or replace function public.get_public_booking_status(
  p_tenant_slug text,
  p_booking_code text,
  p_phone text
)
returns table (
  booking_code text,
  booking_status public.booking_status,
  payment_status public.payment_status,
  check_in_date date,
  check_out_date date,
  lodging_total_satang integer,
  deposit_required_satang integer,
  deposit_deadline_at timestamptz,
  reschedule_count smallint,
  pet_names text[],
  promptpay_display_value text,
  bank_name text,
  bank_account_name text,
  bank_account_number_masked text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return query
  select
    booking.booking_code,
    booking.status,
    booking.payment_status,
    booking_group.check_in_date,
    booking_group.check_out_date,
    booking.lodging_total_satang,
    (
      select payment.amount_satang
      from public.payments payment
      where payment.tenant_id = booking.tenant_id
        and payment.booking_id = booking.id
        and payment.payment_type = 'DEPOSIT'
    ),
    booking.deposit_deadline_at,
    booking.reschedule_count,
    coalesce(array_agg(pet.name order by booking_pet.position), array[]::text[]),
    case when booking.status = 'APPROVED_AWAITING_DEPOSIT' then settings.promptpay_display_value end,
    case when booking.status = 'APPROVED_AWAITING_DEPOSIT' then settings.bank_name end,
    case when booking.status = 'APPROVED_AWAITING_DEPOSIT' then settings.bank_account_name end,
    case when booking.status = 'APPROVED_AWAITING_DEPOSIT' then settings.bank_account_number_masked end
  from public.bookings booking
  join public.booking_groups booking_group
    on booking_group.tenant_id = booking.tenant_id
   and booking_group.id = booking.booking_group_id
  join public.customers customer
    on customer.tenant_id = booking_group.tenant_id
   and customer.id = booking_group.customer_id
  join public.tenants tenant
    on tenant.id = booking.tenant_id
  left join public.booking_pets booking_pet
    on booking_pet.tenant_id = booking.tenant_id
   and booking_pet.booking_id = booking.id
  left join public.pets pet
    on pet.tenant_id = booking_pet.tenant_id
   and pet.id = booking_pet.pet_id
  left join public.tenant_settings settings
    on settings.tenant_id = booking.tenant_id
  where booking.booking_code = upper(btrim(p_booking_code))
    and customer.phone = public.normalize_phone(p_phone)
    and tenant.slug = p_tenant_slug
  group by booking.id, booking_group.id, settings.tenant_id;
end;
$$;

revoke all on function public.get_public_booking_status(text, text, text)
  from public, anon, authenticated;
grant execute on function public.get_public_booking_status(text, text, text) to service_role;

create or replace function public.request_public_reschedule(
  p_tenant_slug text,
  p_booking_code text,
  p_phone text,
  p_new_check_in_date date,
  p_new_check_out_date date,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_booking public.bookings%rowtype;
  target_group public.booking_groups%rowtype;
  created_request_id uuid;
  bangkok_today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select booking.*
  into target_booking
  from public.bookings booking
  join public.booking_groups booking_group
    on booking_group.tenant_id = booking.tenant_id
   and booking_group.id = booking.booking_group_id
  join public.customers customer
    on customer.tenant_id = booking_group.tenant_id
   and customer.id = booking_group.customer_id
  join public.tenants tenant
    on tenant.id = booking.tenant_id
  where booking.booking_code = upper(btrim(p_booking_code))
    and customer.phone = public.normalize_phone(p_phone)
    and tenant.slug = p_tenant_slug
  for update of booking;

  if target_booking.id is null then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;
  if target_booking.status not in ('APPROVED_AWAITING_DEPOSIT', 'CONFIRMED') then
    raise exception using errcode = 'P0001', message = 'INVALID_STATUS_TRANSITION';
  end if;

  select * into target_group
  from public.booking_groups booking_group
  where booking_group.tenant_id = target_booking.tenant_id
    and booking_group.id = target_booking.booking_group_id
  for update;
  if target_booking.reschedule_count >= 1
    or exists (
      select 1 from public.reschedule_requests request
      where request.tenant_id = target_booking.tenant_id
        and request.booking_group_id = target_booking.booking_group_id
        and request.status in ('PENDING', 'APPROVED')
    )
  then
    raise exception using errcode = 'P0001', message = 'RESCHEDULE_LIMIT_REACHED';
  end if;
  if target_group.check_in_date - bangkok_today < 3
    or p_new_check_in_date - bangkok_today < 3
  then
    raise exception using errcode = 'P0001', message = 'RESCHEDULE_NOTICE_TOO_SHORT';
  end if;
  if p_new_check_out_date <= p_new_check_in_date then
    raise exception using errcode = '22023', message = 'INVALID_DATE_RANGE';
  end if;

  insert into public.reschedule_requests (
    tenant_id, booking_group_id,
    old_check_in_date, old_check_out_date,
    new_check_in_date, new_check_out_date,
    customer_reason
  ) values (
    target_booking.tenant_id, target_booking.booking_group_id,
    target_group.check_in_date, target_group.check_out_date,
    p_new_check_in_date, p_new_check_out_date,
    nullif(btrim(coalesce(p_reason, '')), '')
  ) returning id into created_request_id;

  insert into public.outbox_events (
    tenant_id, event_type, aggregate_type, aggregate_id,
    idempotency_key, payload
  ) values (
    target_booking.tenant_id, 'RESCHEDULE_REQUESTED', 'RESCHEDULE_REQUEST',
    created_request_id, 'reschedule-requested:' || created_request_id::text,
    jsonb_build_object('bookingGroupId', target_booking.booking_group_id)
  ) on conflict (tenant_id, idempotency_key) do nothing;

  insert into public.audit_logs (
    tenant_id, action, entity_type, entity_id, after_summary
  ) values (
    target_booking.tenant_id, 'PUBLIC_RESCHEDULE_REQUESTED',
    'RESCHEDULE_REQUEST', created_request_id,
    jsonb_build_object(
      'booking_group_id', target_booking.booking_group_id,
      'new_check_in_date', p_new_check_in_date,
      'new_check_out_date', p_new_check_out_date
    )
  );

  return created_request_id;
end;
$$;

revoke all on function public.request_public_reschedule(text, text, text, date, date, text)
  from public, anon, authenticated;
grant execute on function public.request_public_reschedule(text, text, text, date, date, text)
  to service_role;

create or replace function public.decide_reschedule_request(
  p_request_id uuid,
  p_decision text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_request public.reschedule_requests%rowtype;
  target_group public.booking_groups%rowtype;
  target_booking record;
  calculated_nights integer;
  selected_room_id uuid;
  target_line_user_id text;
  target_booking_code text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;

  select * into target_request from public.reschedule_requests request
  where request.id = p_request_id for update;
  if target_request.id is null then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;
  if not public.has_tenant_role(
    target_request.tenant_id,
    array['OWNER', 'DOCTOR', 'STAFF']::public.clinic_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if target_request.status <> 'PENDING' then
    raise exception using errcode = 'P0001', message = 'INVALID_STATUS_TRANSITION';
  end if;
  if p_decision not in ('APPROVE', 'REJECT') then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  select customer.line_user_id, min(booking.booking_code)
  into target_line_user_id, target_booking_code
  from public.booking_groups booking_group
  join public.customers customer
    on customer.tenant_id = booking_group.tenant_id
   and customer.id = booking_group.customer_id
  join public.bookings booking
    on booking.tenant_id = booking_group.tenant_id
   and booking.booking_group_id = booking_group.id
  where booking_group.tenant_id = target_request.tenant_id
    and booking_group.id = target_request.booking_group_id
  group by customer.line_user_id;

  if p_decision = 'REJECT' then
    if nullif(btrim(coalesce(p_reason, '')), '') is null then
      raise exception using errcode = '22023', message = 'REASON_REQUIRED';
    end if;
    update public.reschedule_requests
    set status = 'REJECTED', decision_reason = btrim(p_reason),
        decided_at = now(), decided_by = auth.uid()
    where id = target_request.id;
    insert into public.audit_logs (
      tenant_id, actor_user_id, action, entity_type, entity_id,
      before_summary, after_summary
    ) values (
      target_request.tenant_id, auth.uid(), 'RESCHEDULE_REJECTED',
      'RESCHEDULE_REQUEST', target_request.id,
      jsonb_build_object('status', target_request.status),
      jsonb_build_object('status', 'REJECTED', 'reason', btrim(p_reason))
    );
    if target_line_user_id is not null then
      insert into public.outbox_events (
        tenant_id, event_type, aggregate_type, aggregate_id,
        idempotency_key, payload
      ) values (
        target_request.tenant_id, 'LINE_RESCHEDULE_REJECTED',
        'RESCHEDULE_REQUEST', target_request.id,
        'line-reschedule-rejected:' || target_request.id::text,
        jsonb_build_object(
          'lineUserId', target_line_user_id,
          'bookingCode', target_booking_code,
          'reason', btrim(p_reason)
        )
      ) on conflict (tenant_id, idempotency_key) do nothing;
    end if;
    return;
  end if;

  select * into target_group from public.booking_groups booking_group
  where booking_group.id = target_request.booking_group_id for update;
  calculated_nights := target_request.new_check_out_date - target_request.new_check_in_date;

  perform 1
  from public.room_inventory room
  where room.tenant_id = target_request.tenant_id
    and room.species in (
    select booking.species from public.bookings booking
    where booking.tenant_id = target_request.tenant_id
      and booking.booking_group_id = target_request.booking_group_id
  )
  order by room.id
  for update;

  for target_booking in
    select booking.id, booking.reschedule_count, booking.nightly_rate_satang,
           booking.species, booking.room_id
    from public.bookings booking
    where booking.tenant_id = target_request.tenant_id
      and booking.booking_group_id = target_request.booking_group_id
    order by booking.id
    for update
  loop
    if target_booking.reschedule_count >= 1 then
      raise exception using errcode = 'P0001', message = 'RESCHEDULE_LIMIT_REACHED';
    end if;

    selected_room_id := null;
    select room.id into selected_room_id
    from public.room_inventory room
    where room.tenant_id = target_request.tenant_id
      and room.species = target_booking.species
      and room.operational_status = 'AVAILABLE'
      and not exists (
        select 1 from public.room_stays stay
        where stay.tenant_id = room.tenant_id
          and stay.room_id = room.id
          and stay.checked_out_at is null
      )
      and not exists (
        select 1 from public.room_allocations allocation
        where allocation.tenant_id = room.tenant_id
          and allocation.room_id = room.id
          and allocation.status in ('HOLD', 'RESERVED')
          and allocation.booking_id is distinct from target_booking.id
          and allocation.stay_range && daterange(
            target_request.new_check_in_date,
            target_request.new_check_out_date,
            '[)'
          )
      )
    order by (room.id = target_booking.room_id) desc, room.room_code
    limit 1;
    if selected_room_id is null then
      raise exception using errcode = '23P01', message = 'ROOM_UNAVAILABLE';
    end if;

    begin
      update public.room_allocations
      set room_id = selected_room_id,
          start_date = target_request.new_check_in_date,
          end_date = target_request.new_check_out_date
      where tenant_id = target_request.tenant_id
        and booking_id = target_booking.id
        and status in ('HOLD', 'RESERVED');
    exception when exclusion_violation then
      raise exception using errcode = '23P01', message = 'ROOM_UNAVAILABLE';
    end;

    update public.bookings
    set room_id = selected_room_id,
        reschedule_count = reschedule_count + 1,
        quoted_nights = calculated_nights,
        lodging_total_satang = nightly_rate_satang * calculated_nights
    where id = target_booking.id;
  end loop;

  update public.booking_groups
  set check_in_date = target_request.new_check_in_date,
      check_out_date = target_request.new_check_out_date
  where id = target_request.booking_group_id;

  update public.reschedule_requests
  set status = 'APPROVED', decision_reason = nullif(btrim(coalesce(p_reason, '')), ''),
      decided_at = now(), decided_by = auth.uid()
  where id = target_request.id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id,
    before_summary, after_summary
  ) values (
    target_request.tenant_id, auth.uid(), 'RESCHEDULE_APPROVED',
    'BOOKING_GROUP', target_request.booking_group_id,
    jsonb_build_object('check_in_date', target_request.old_check_in_date, 'check_out_date', target_request.old_check_out_date),
    jsonb_build_object('check_in_date', target_request.new_check_in_date, 'check_out_date', target_request.new_check_out_date)
  );

  if target_line_user_id is not null then
    insert into public.outbox_events (
      tenant_id, event_type, aggregate_type, aggregate_id,
      idempotency_key, payload
    ) values (
      target_request.tenant_id, 'LINE_RESCHEDULE_APPROVED',
      'RESCHEDULE_REQUEST', target_request.id,
      'line-reschedule-approved:' || target_request.id::text,
      jsonb_build_object(
        'lineUserId', target_line_user_id,
        'bookingCode', target_booking_code,
        'newCheckInDate', target_request.new_check_in_date,
        'newCheckOutDate', target_request.new_check_out_date
      )
    ) on conflict (tenant_id, idempotency_key) do nothing;
  end if;
end;
$$;

revoke all on function public.decide_reschedule_request(uuid, text, text)
  from public, anon;
grant execute on function public.decide_reschedule_request(uuid, text, text)
  to authenticated;

create or replace function public.claim_outbox_events(p_limit integer default 20)
returns table (
  event_id uuid,
  event_type text,
  payload jsonb,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  return query
  with claimed as (
    select event.id
    from public.outbox_events event
    where (
      event.status in ('PENDING', 'FAILED')
      or (event.status = 'PROCESSING' and event.processing_started_at < now() - interval '5 minutes')
    )
      and event.available_at <= now()
    order by event.available_at, event.created_at
    for update skip locked
    limit p_limit
  )
  update public.outbox_events event
  set status = 'PROCESSING',
      processing_started_at = now(),
      attempt_count = event.attempt_count + 1,
      last_error_code = null
  from claimed
  where event.id = claimed.id
  returning event.id, event.event_type, event.payload, event.attempt_count;
end;
$$;

revoke all on function public.claim_outbox_events(integer)
  from public, anon, authenticated;
grant execute on function public.claim_outbox_events(integer) to service_role;

create or replace function public.complete_outbox_event(
  p_event_id uuid,
  p_succeeded boolean,
  p_error_code text,
  p_retry_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  update public.outbox_events
  set status = case when p_succeeded then 'SENT'::public.outbox_status else 'FAILED'::public.outbox_status end,
      processed_at = case when p_succeeded then now() else null end,
      processing_started_at = null,
      last_error_code = case when p_succeeded then null else left(coalesce(p_error_code, 'UNKNOWN'), 100) end,
      available_at = case when p_succeeded then available_at else coalesce(p_retry_at, now() + interval '5 minutes') end
  where id = p_event_id
    and status <> 'SENT';
end;
$$;

revoke all on function public.complete_outbox_event(uuid, boolean, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.complete_outbox_event(uuid, boolean, text, timestamptz)
  to service_role;

comment on table public.payments is
  'Phase 4 payment facts. The 500 THB LINE deposit is recorded per booking unit pending final multi-room policy confirmation.';
comment on function public.expire_due_line_deposits(integer) is
  'Idempotent expiry: only currently-awaiting due bookings transition and release capacity once.';
