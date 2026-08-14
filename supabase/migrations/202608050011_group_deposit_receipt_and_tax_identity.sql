alter table public.payments
add column booking_group_id uuid;

update public.payments payment
set booking_group_id = booking.booking_group_id
from public.bookings booking
where booking.tenant_id = payment.tenant_id
  and booking.id = payment.booking_id;

alter table public.payments
alter column booking_group_id set not null,
add foreign key (tenant_id, booking_group_id)
  references public.booking_groups(tenant_id, id) on delete restrict;

create temporary table deposit_survivors on commit drop as
select distinct on (payment.tenant_id, payment.booking_group_id)
  payment.tenant_id,
  payment.booking_group_id,
  payment.id,
  max(payment.amount_satang) over (
    partition by payment.tenant_id, payment.booking_group_id
  )::integer as amount_satang
from public.payments payment
where payment.payment_type = 'DEPOSIT'
order by
  payment.tenant_id,
  payment.booking_group_id,
  case payment.status
    when 'VERIFIED' then 1
    when 'SUBMITTED' then 2
    when 'WAITING' then 3
    when 'REFUND_DUE' then 4
    when 'REFUNDED' then 5
    when 'FORFEITED' then 6
    when 'EXPIRED' then 7
    else 8
  end,
  payment.created_at,
  payment.id;

update public.payments refund
set matching_original_payment_id = survivor.id
from public.payments original
join deposit_survivors survivor
  on survivor.tenant_id = original.tenant_id
 and survivor.booking_group_id = original.booking_group_id
where refund.matching_original_payment_id = original.id
  and original.id <> survivor.id;

update public.file_assets asset
set entity_id = survivor.id
from public.payments payment
join deposit_survivors survivor
  on survivor.tenant_id = payment.tenant_id
 and survivor.booking_group_id = payment.booking_group_id
where asset.tenant_id = payment.tenant_id
  and asset.entity_type = 'PAYMENT'
  and asset.entity_id = payment.id
  and payment.payment_type = 'DEPOSIT'
  and payment.id <> survivor.id;

delete from public.payments payment
using deposit_survivors survivor
where payment.tenant_id = survivor.tenant_id
  and payment.booking_group_id = survivor.booking_group_id
  and payment.payment_type = 'DEPOSIT'
  and payment.id <> survivor.id;

alter table public.payments
drop constraint payments_tenant_id_booking_id_payment_type_key,
alter column booking_id drop not null;

update public.payments payment
set booking_id = null,
    amount_satang = survivor.amount_satang
from deposit_survivors survivor
where payment.id = survivor.id;

create unique index payments_one_deposit_per_group_uidx
  on public.payments (tenant_id, booking_group_id)
  where payment_type = 'DEPOSIT';
create unique index payments_one_group_checkout_uidx
  on public.payments (tenant_id, booking_group_id)
  where payment_type = 'CHECKOUT' and booking_id is null;
create unique index payments_one_group_refund_uidx
  on public.payments (tenant_id, booking_group_id)
  where payment_type = 'REFUND' and booking_id is null;
create index payments_tenant_group_status_idx
  on public.payments (tenant_id, booking_group_id, status, created_at);

alter table public.receipts
add column booking_group_id uuid,
add column is_group_receipt boolean not null default false,
add column tax_section_enabled boolean not null default false,
add column tax_heading text,
add column tax_id text,
add column branch_number text;

update public.receipts receipt
set booking_group_id = booking.booking_group_id
from public.bookings booking
where booking.tenant_id = receipt.tenant_id
  and booking.id = receipt.booking_id;

alter table public.receipts
alter column booking_group_id set not null,
add foreign key (tenant_id, booking_group_id)
  references public.booking_groups(tenant_id, id) on delete restrict,
add constraint receipt_tax_snapshot_consistent check (
  (tax_section_enabled
    and nullif(btrim(tax_heading), '') is not null
    and (nullif(btrim(tax_id), '') is not null
      or nullif(btrim(branch_number), '') is not null))
  or (not tax_section_enabled
    and tax_heading is null and tax_id is null and branch_number is null)
);

drop index public.receipts_one_active_per_booking_uidx;
create unique index receipts_one_active_group_receipt_uidx
  on public.receipts (tenant_id, booking_group_id)
  where status = 'ISSUED' and is_group_receipt;
create index receipts_tenant_group_idx
  on public.receipts (tenant_id, booking_group_id, issued_at desc);

alter table public.tenant_settings
add column receipt_tax_enabled boolean not null default false,
add column receipt_tax_heading text,
add column tax_id text,
add column branch_number text,
add constraint tenant_settings_tax_identity_consistent check (
  (receipt_tax_enabled
    and nullif(btrim(receipt_tax_heading), '') is not null
    and char_length(receipt_tax_heading) <= 100
    and (nullif(btrim(tax_id), '') is not null
      or nullif(btrim(branch_number), '') is not null))
  or (not receipt_tax_enabled
    and receipt_tax_heading is null and tax_id is null and branch_number is null)
),
add constraint tenant_settings_tax_id_format check (
  tax_id is null or tax_id ~ '^[0-9]{13}$'
),
add constraint tenant_settings_branch_number_length check (
  branch_number is null or char_length(branch_number) <= 50
);

create or replace function public.set_receipt_clinic_address()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.reissued_from_receipt_id is not null then
    select
      receipt.booking_group_id,
      receipt.is_group_receipt,
      receipt.clinic_address,
      receipt.tax_section_enabled,
      receipt.tax_heading,
      receipt.tax_id,
      receipt.branch_number
    into
      new.booking_group_id,
      new.is_group_receipt,
      new.clinic_address,
      new.tax_section_enabled,
      new.tax_heading,
      new.tax_id,
      new.branch_number
    from public.receipts receipt
    where receipt.tenant_id = new.tenant_id
      and receipt.id = new.reissued_from_receipt_id;
  elsif new.clinic_address is null then
    select settings.clinic_address into new.clinic_address
    from public.tenant_settings settings
    where settings.tenant_id = new.tenant_id;
  end if;

  return new;
end;
$$;

revoke execute on function public.update_tenant_configuration(
  uuid, text, text, text, text, text, text, bigint, text, text, text, text
) from authenticated;

create or replace function public.update_tenant_configuration(
  p_tenant_id uuid,
  p_thai_name text,
  p_english_name text,
  p_clinic_address text,
  p_contact_phone text,
  p_logo_storage_path text,
  p_logo_mime_type text,
  p_logo_size_bytes bigint,
  p_promptpay_display_value text,
  p_bank_name text,
  p_bank_account_name text,
  p_bank_account_number_masked text,
  p_receipt_tax_enabled boolean,
  p_receipt_tax_heading text,
  p_tax_id text,
  p_branch_number text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_heading text := nullif(btrim(coalesce(p_receipt_tax_heading, '')), '');
  clean_tax_id text := nullif(regexp_replace(coalesce(p_tax_id, ''), '[^0-9]', '', 'g'), '');
  clean_branch text := nullif(btrim(coalesce(p_branch_number, '')), '');
begin
  if coalesce(p_receipt_tax_enabled, false)
    and (clean_heading is null
      or char_length(clean_heading) > 100
      or (clean_tax_id is null and clean_branch is null))
  then
    raise exception using errcode = '22023', message = 'TAX_IDENTITY_INCOMPLETE';
  end if;
  if clean_tax_id is not null and clean_tax_id !~ '^[0-9]{13}$' then
    raise exception using errcode = '22023', message = 'TAX_ID_INVALID';
  end if;
  if coalesce(char_length(clean_branch), 0) > 50 then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  perform public.update_tenant_configuration(
    p_tenant_id,
    p_thai_name,
    p_english_name,
    p_clinic_address,
    p_contact_phone,
    p_logo_storage_path,
    p_logo_mime_type,
    p_logo_size_bytes,
    p_promptpay_display_value,
    p_bank_name,
    p_bank_account_name,
    p_bank_account_number_masked
  );

  update public.tenant_settings
  set receipt_tax_enabled = coalesce(p_receipt_tax_enabled, false),
      receipt_tax_heading = case when p_receipt_tax_enabled then clean_heading end,
      tax_id = case when p_receipt_tax_enabled then clean_tax_id end,
      branch_number = case when p_receipt_tax_enabled then clean_branch end
  where tenant_id = p_tenant_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    p_tenant_id,
    auth.uid(),
    'RECEIPT_TAX_IDENTITY_UPDATED',
    'TENANT',
    p_tenant_id,
    jsonb_build_object(
      'enabled', coalesce(p_receipt_tax_enabled, false),
      'has_tax_id', clean_tax_id is not null,
      'has_branch_number', clean_branch is not null
    )
  );
end;
$$;

revoke all on function public.update_tenant_configuration(
  uuid, text, text, text, text, text, text, bigint, text, text, text, text,
  boolean, text, text, text
) from public, anon;
grant execute on function public.update_tenant_configuration(
  uuid, text, text, text, text, text, text, bigint, text, text, text, text,
  boolean, text, text, text
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
  target_payment public.payments%rowtype;
  target_channel public.booking_channel;
  target_line_user_id text;
  clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  deadline timestamptz;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;

  select booking.* into target_booking
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
  if p_decision not in ('APPROVE', 'REJECT') then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  perform 1 from public.booking_groups booking_group
  where booking_group.tenant_id = target_booking.tenant_id
    and booking_group.id = target_booking.booking_group_id
  for update;

  select booking_group.channel, customer.line_user_id
  into target_channel, target_line_user_id
  from public.booking_groups booking_group
  join public.customers customer
    on customer.tenant_id = booking_group.tenant_id
   and customer.id = booking_group.customer_id
  where booking_group.tenant_id = target_booking.tenant_id
    and booking_group.id = target_booking.booking_group_id;

  if p_decision = 'REJECT' then
    if clean_reason is null then
      raise exception using errcode = '22023', message = 'REASON_REQUIRED';
    end if;
    update public.bookings
    set status = 'REJECTED', reviewed_at = now(), reviewed_by = auth.uid(),
        rejection_reason = clean_reason
    where id = target_booking.id;
    update public.room_allocations
    set status = 'RELEASED', released_at = now(),
        release_reason = 'BOOKING_REJECTED'
    where tenant_id = target_booking.tenant_id
      and booking_id = target_booking.id
      and status in ('HOLD', 'RESERVED');

    if target_line_user_id is not null then
      insert into public.outbox_events (
        tenant_id, event_type, aggregate_type, aggregate_id,
        idempotency_key, payload
      ) values (
        target_booking.tenant_id, 'LINE_BOOKING_REJECTED', 'BOOKING',
        target_booking.id, 'line-booking-rejected:' || target_booking.id::text,
        jsonb_build_object('lineUserId', target_line_user_id,
          'bookingCode', target_booking.booking_code, 'reason', clean_reason)
      ) on conflict (tenant_id, idempotency_key) do nothing;
    end if;
  elsif target_channel = 'LINE' then
    if nullif(btrim(coalesce(target_line_user_id, '')), '') is null then
      raise exception using errcode = '22023', message = 'LINE_ID_REQUIRED';
    end if;

    select * into target_payment from public.payments payment
    where payment.tenant_id = target_booking.tenant_id
      and payment.booking_group_id = target_booking.booking_group_id
      and payment.payment_type = 'DEPOSIT'
    for update;

    if target_payment.id is not null and target_payment.status = 'VERIFIED' then
      update public.bookings
      set status = 'CONFIRMED', payment_status = 'VERIFIED',
          confirmed_at = now(), reviewed_at = now(), reviewed_by = auth.uid(),
          rejection_reason = null, deposit_deadline_at = null
      where id = target_booking.id;
      update public.room_allocations set status = 'RESERVED'
      where tenant_id = target_booking.tenant_id
        and booking_id = target_booking.id and status = 'HOLD';
    else
      if target_payment.id is not null
        and target_payment.status not in ('WAITING', 'SUBMITTED')
      then
        raise exception using errcode = 'P0001', message = 'GROUP_DEPOSIT_CLOSED';
      end if;

      select min(booking.deposit_deadline_at) into deadline
      from public.bookings booking
      where booking.tenant_id = target_booking.tenant_id
        and booking.booking_group_id = target_booking.booking_group_id
        and booking.status = 'APPROVED_AWAITING_DEPOSIT'
        and booking.deposit_deadline_at > now();
      deadline := coalesce(deadline, now() + interval '1 hour');

      if target_payment.id is null then
        insert into public.payments (
          tenant_id, booking_group_id, booking_id, payment_type,
          amount_satang, status
        ) values (
          target_booking.tenant_id, target_booking.booking_group_id, null,
          'DEPOSIT', 50000, 'WAITING'
        ) returning * into target_payment;
      end if;

      update public.bookings
      set status = 'APPROVED_AWAITING_DEPOSIT',
          payment_status = target_payment.status,
          deposit_deadline_at = deadline, reviewed_at = now(),
          reviewed_by = auth.uid(), rejection_reason = null
      where id = target_booking.id;

      insert into public.outbox_events (
        tenant_id, event_type, aggregate_type, aggregate_id,
        idempotency_key, payload
      ) values (
        target_booking.tenant_id, 'LINE_DEPOSIT_REQUIRED', 'BOOKING_GROUP',
        target_booking.booking_group_id,
        'line-deposit-required-group:' || target_booking.booking_group_id::text,
        jsonb_build_object(
          'lineUserId', target_line_user_id,
          'bookingCodes', (
            select jsonb_agg(booking.booking_code order by booking.booking_code)
            from public.bookings booking
            where booking.tenant_id = target_booking.tenant_id
              and booking.booking_group_id = target_booking.booking_group_id
          ),
          'amountSatang', 50000, 'deadlineAt', deadline
        )
      ) on conflict (tenant_id, idempotency_key) do nothing;
    end if;
  else
    update public.bookings
    set status = 'CONFIRMED', payment_status = 'NOT_REQUIRED',
        confirmed_at = now(), reviewed_at = now(), reviewed_by = auth.uid(),
        rejection_reason = null
    where id = target_booking.id;
    update public.room_allocations set status = 'RESERVED'
    where tenant_id = target_booking.tenant_id
      and booking_id = target_booking.id and status = 'HOLD';
  end if;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id,
    before_summary, after_summary
  ) values (
    target_booking.tenant_id, auth.uid(),
    case when p_decision = 'APPROVE' then 'BOOKING_REVIEW_APPROVED'
      else 'BOOKING_REVIEW_REJECTED' end,
    'BOOKING', target_booking.id,
    jsonb_build_object('status', target_booking.status,
      'version', target_booking.version),
    jsonb_build_object('decision', p_decision, 'reason', clean_reason,
      'deposit_scope', case when target_channel = 'LINE' then 'BOOKING_GROUP' end)
  );

  return query
  select booking.id, booking.status, booking.payment_status, booking.version
  from public.bookings booking where booking.id = target_booking.id;
end;
$$;

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
  join public.tenants tenant on tenant.id = booking.tenant_id
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

  select * into target_payment from public.payments payment
  where payment.tenant_id = target_booking.tenant_id
    and payment.booking_group_id = target_booking.booking_group_id
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
  set status = 'SUBMITTED', evidence_asset_id = created_asset_id,
      submitted_at = now()
  where id = target_payment.id;
  update public.bookings set payment_status = 'SUBMITTED'
  where tenant_id = target_booking.tenant_id
    and booking_group_id = target_booking.booking_group_id
    and status = 'APPROVED_AWAITING_DEPOSIT';

  insert into public.audit_logs (
    tenant_id, action, entity_type, entity_id, after_summary
  ) values (
    target_booking.tenant_id, 'DEPOSIT_EVIDENCE_SUBMITTED', 'PAYMENT',
    target_payment.id,
    jsonb_build_object('booking_group_id', target_booking.booking_group_id,
      'submitted_with_booking_code', target_booking.booking_code)
  );
end;
$$;

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
  deadline timestamptz;
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
    target_payment.tenant_id, array['OWNER', 'STAFF']::public.clinic_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  perform 1 from public.bookings booking
  where booking.tenant_id = target_payment.tenant_id
    and booking.booking_group_id = target_payment.booking_group_id
    and booking.status = 'APPROVED_AWAITING_DEPOSIT'
  order by booking.id for update;

  select booking.* into target_booking from public.bookings booking
  where booking.tenant_id = target_payment.tenant_id
    and booking.booking_group_id = target_payment.booking_group_id
    and booking.status = 'APPROVED_AWAITING_DEPOSIT'
    and booking.version = p_expected_booking_version
  order by booking.id limit 1;
  if target_booking.id is null then
    if exists (
      select 1 from public.bookings booking
      where booking.tenant_id = target_payment.tenant_id
        and booking.booking_group_id = target_payment.booking_group_id
        and booking.status = 'APPROVED_AWAITING_DEPOSIT'
    ) then
      raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
    end if;
    raise exception using errcode = 'P0001', message = 'INVALID_STATUS_TRANSITION';
  end if;

  select min(booking.deposit_deadline_at) into deadline
  from public.bookings booking
  where booking.tenant_id = target_payment.tenant_id
    and booking.booking_group_id = target_payment.booking_group_id
    and booking.status = 'APPROVED_AWAITING_DEPOSIT';
  if target_payment.status <> 'SUBMITTED' then
    raise exception using errcode = 'P0001', message = 'INVALID_STATUS_TRANSITION';
  end if;
  if deadline <= now() then
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
  where tenant_id = target_payment.tenant_id
    and booking_group_id = target_payment.booking_group_id
    and status = 'APPROVED_AWAITING_DEPOSIT';
  update public.room_allocations allocation set status = 'RESERVED'
  from public.bookings booking
  where booking.tenant_id = target_payment.tenant_id
    and booking.booking_group_id = target_payment.booking_group_id
    and allocation.tenant_id = booking.tenant_id
    and allocation.booking_id = booking.id
    and booking.status = 'CONFIRMED'
    and allocation.status = 'HOLD';

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    target_payment.tenant_id, auth.uid(), 'DEPOSIT_VERIFIED', 'PAYMENT',
    target_payment.id,
    jsonb_build_object('booking_group_id', target_payment.booking_group_id,
      'amount_satang', target_payment.amount_satang)
  );

  select customer.line_user_id into target_line_user_id
  from public.booking_groups booking_group
  join public.customers customer
    on customer.tenant_id = booking_group.tenant_id
   and customer.id = booking_group.customer_id
  where booking_group.tenant_id = target_payment.tenant_id
    and booking_group.id = target_payment.booking_group_id;
  if target_line_user_id is not null then
    insert into public.outbox_events (
      tenant_id, event_type, aggregate_type, aggregate_id,
      idempotency_key, payload
    ) values (
      target_payment.tenant_id, 'LINE_BOOKING_CONFIRMED', 'BOOKING_GROUP',
      target_payment.booking_group_id,
      'line-booking-confirmed-group:' || target_payment.booking_group_id::text,
      jsonb_build_object(
        'lineUserId', target_line_user_id,
        'bookingCodes', (
          select jsonb_agg(booking.booking_code order by booking.booking_code)
          from public.bookings booking
          where booking.tenant_id = target_payment.tenant_id
            and booking.booking_group_id = target_payment.booking_group_id
        )
      )
    ) on conflict (tenant_id, idempotency_key) do nothing;
  end if;
end;
$$;

create or replace function public.expire_due_line_deposits(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  due_payment record;
  expired_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if p_limit not between 1 and 500 then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  for due_payment in
    select payment.id, payment.tenant_id, payment.booking_group_id,
      due.deadline_at, customer.line_user_id
    from public.payments payment
    join lateral (
      select min(booking.deposit_deadline_at) as deadline_at
      from public.bookings booking
      where booking.tenant_id = payment.tenant_id
        and booking.booking_group_id = payment.booking_group_id
        and booking.status = 'APPROVED_AWAITING_DEPOSIT'
    ) due on due.deadline_at <= now()
    join public.booking_groups booking_group
      on booking_group.tenant_id = payment.tenant_id
     and booking_group.id = payment.booking_group_id
    join public.customers customer
      on customer.tenant_id = booking_group.tenant_id
     and customer.id = booking_group.customer_id
    where payment.payment_type = 'DEPOSIT'
      and payment.status in ('WAITING', 'SUBMITTED')
    order by due.deadline_at
    for update of payment skip locked
    limit p_limit
  loop
    update public.payments set status = 'EXPIRED'
    where id = due_payment.id and status in ('WAITING', 'SUBMITTED');
    if not found then continue; end if;

    update public.bookings
    set status = 'EXPIRED_PAYMENT', payment_status = 'EXPIRED'
    where tenant_id = due_payment.tenant_id
      and booking_group_id = due_payment.booking_group_id
      and status in ('PENDING_APPROVAL', 'APPROVED_AWAITING_DEPOSIT');
    update public.room_allocations allocation
    set status = 'EXPIRED', released_at = now(),
        release_reason = 'PAYMENT_DEADLINE_EXPIRED'
    from public.bookings booking
    where booking.tenant_id = due_payment.tenant_id
      and booking.booking_group_id = due_payment.booking_group_id
      and allocation.tenant_id = booking.tenant_id
      and allocation.booking_id = booking.id
      and booking.status = 'EXPIRED_PAYMENT'
      and allocation.status in ('HOLD', 'RESERVED');

    insert into public.audit_logs (
      tenant_id, action, entity_type, entity_id, after_summary
    ) values (
      due_payment.tenant_id, 'LINE_DEPOSIT_EXPIRED', 'BOOKING_GROUP',
      due_payment.booking_group_id,
      jsonb_build_object('payment_id', due_payment.id)
    );
    if due_payment.line_user_id is not null then
      insert into public.outbox_events (
        tenant_id, event_type, aggregate_type, aggregate_id,
        idempotency_key, payload
      ) values (
        due_payment.tenant_id, 'LINE_DEPOSIT_EXPIRED', 'BOOKING_GROUP',
        due_payment.booking_group_id,
        'line-deposit-expired-group:' || due_payment.booking_group_id::text,
        jsonb_build_object(
          'lineUserId', due_payment.line_user_id,
          'bookingCodes', (
            select jsonb_agg(booking.booking_code order by booking.booking_code)
            from public.bookings booking
            where booking.tenant_id = due_payment.tenant_id
              and booking.booking_group_id = due_payment.booking_group_id
          )
        )
      ) on conflict (tenant_id, idempotency_key) do nothing;
    end if;
    expired_count := expired_count + 1;
  end loop;
  return expired_count;
end;
$$;

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
  select booking.booking_code, booking.status, booking.payment_status,
    booking_group.check_in_date, booking_group.check_out_date,
    booking.lodging_total_satang,
    (select payment.amount_satang from public.payments payment
      where payment.tenant_id = booking.tenant_id
        and payment.booking_group_id = booking.booking_group_id
        and payment.payment_type = 'DEPOSIT'),
    booking.deposit_deadline_at, booking.reschedule_count,
    coalesce(array_agg(pet.name order by booking_pet.position), array[]::text[]),
    case when booking.status = 'APPROVED_AWAITING_DEPOSIT'
      then settings.promptpay_display_value end,
    case when booking.status = 'APPROVED_AWAITING_DEPOSIT'
      then settings.bank_name end,
    case when booking.status = 'APPROVED_AWAITING_DEPOSIT'
      then settings.bank_account_name end,
    case when booking.status = 'APPROVED_AWAITING_DEPOSIT'
      then settings.bank_account_number_masked end
  from public.bookings booking
  join public.booking_groups booking_group
    on booking_group.tenant_id = booking.tenant_id
   and booking_group.id = booking.booking_group_id
  join public.customers customer
    on customer.tenant_id = booking_group.tenant_id
   and customer.id = booking_group.customer_id
  join public.tenants tenant on tenant.id = booking.tenant_id
  left join public.booking_pets booking_pet
    on booking_pet.tenant_id = booking.tenant_id
   and booking_pet.booking_id = booking.id
  left join public.pets pet
    on pet.tenant_id = booking_pet.tenant_id and pet.id = booking_pet.pet_id
  left join public.tenant_settings settings on settings.tenant_id = booking.tenant_id
  where booking.booking_code = upper(btrim(p_booking_code))
    and customer.phone = public.normalize_phone(p_phone)
    and tenant.slug = p_tenant_slug
  group by booking.id, booking_group.id, settings.tenant_id;
end;
$$;

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
  stay_deposit_snapshot integer := 0;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  if p_deposit_satang is null or p_deposit_satang < 0
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
  where booking_group.id = target_booking.booking_group_id for update;

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
    select 1 from public.room_stays stay
    where stay.tenant_id = target_tenant_id and stay.room_id = p_room_id
      and stay.checked_out_at is null
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
      update public.room_allocations
      set status = 'RELEASED', released_at = now(),
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

  select coalesce(payment.amount_satang, 0) into existing_deposit
  from public.payments payment
  where payment.tenant_id = target_tenant_id
    and payment.booking_group_id = target_booking.booking_group_id
    and payment.payment_type = 'DEPOSIT'
    and payment.status = 'VERIFIED'
  for update;
  existing_deposit := coalesce(existing_deposit, 0);
  if p_deposit_satang < existing_deposit then
    raise exception using errcode = '22023', message = 'DEPOSIT_BELOW_VERIFIED';
  end if;
  if p_deposit_satang > 0 then
    insert into public.payments (
      tenant_id, booking_group_id, booking_id, payment_type, amount_satang,
      status, submitted_at, verified_at, verified_by, notes
    ) values (
      target_tenant_id, target_booking.booking_group_id, null, 'DEPOSIT',
      p_deposit_satang, 'VERIFIED', now(), now(), auth.uid(),
      'ยอดมัดจำรวมของ booking group ที่ยืนยัน ณ เช็กอิน'
    ) on conflict (tenant_id, booking_group_id)
      where payment_type = 'DEPOSIT'
    do update set amount_satang = excluded.amount_satang, status = 'VERIFIED',
      submitted_at = coalesce(public.payments.submitted_at, now()),
      verified_at = now(), verified_by = auth.uid(), notes = excluded.notes;
  end if;

  if not exists (
    select 1 from public.room_stays stay
    join public.bookings booking
      on booking.tenant_id = stay.tenant_id and booking.id = stay.booking_id
    where booking.tenant_id = target_tenant_id
      and booking.booking_group_id = target_booking.booking_group_id
      and stay.deposit_satang > 0
  ) then
    stay_deposit_snapshot := p_deposit_satang;
  end if;

  insert into public.room_stays (
    tenant_id, booking_id, room_id, checked_in_at, check_in_notes,
    deposit_satang, checked_in_by
  ) values (
    target_tenant_id, p_booking_id, p_room_id, now(),
    nullif(btrim(coalesce(p_notes, '')), ''), stay_deposit_snapshot, auth.uid()
  ) returning id into stay_id;
  update public.bookings set room_id = p_room_id, status = 'CHECKED_IN'
  where id = p_booking_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    target_tenant_id, auth.uid(), 'BOOKING_CHECKED_IN', 'ROOM_STAY', stay_id,
    jsonb_build_object('booking_id', p_booking_id, 'room_id', p_room_id,
      'booking_group_id', target_booking.booking_group_id,
      'group_deposit_satang', p_deposit_satang)
  );
  response_payload := jsonb_build_object(
    'bookingId', p_booking_id, 'bookingGroupId', target_booking.booking_group_id,
    'stayId', stay_id, 'roomId', p_room_id, 'status', 'CHECKED_IN'
  );
  update public.idempotency_keys set result = response_payload
  where id = claimed_key_id;
  return response_payload;
end;
$$;

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
  lodging_total integer;
  extra_total integer;
  group_deposit integer;
  final_group_checkout boolean;
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
  where stay.tenant_id = target_booking.tenant_id
    and stay.booking_id = p_booking_id and stay.checked_out_at is null;
  if target_stay.id is null then
    raise exception using errcode = 'P0002', message = 'OPEN_STAY_NOT_FOUND';
  end if;

  select coalesce(sum(booking.lodging_total_satang), 0)::integer
  into lodging_total from public.bookings booking
  where booking.tenant_id = target_booking.tenant_id
    and booking.booking_group_id = target_booking.booking_group_id
    and booking.status in ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT');
  select coalesce(sum(charge.amount_satang), 0)::integer into extra_total
  from public.booking_charges charge
  join public.bookings booking
    on booking.tenant_id = charge.tenant_id and booking.id = charge.booking_id
  where booking.tenant_id = target_booking.tenant_id
    and booking.booking_group_id = target_booking.booking_group_id;
  select coalesce(payment.amount_satang, 0) into group_deposit
  from public.payments payment
  where payment.tenant_id = target_booking.tenant_id
    and payment.booking_group_id = target_booking.booking_group_id
    and payment.payment_type = 'DEPOSIT' and payment.status = 'VERIFIED';
  group_deposit := coalesce(group_deposit, 0);
  final_group_checkout := not exists (
    select 1 from public.bookings booking
    where booking.tenant_id = target_booking.tenant_id
      and booking.booking_group_id = target_booking.booking_group_id
      and booking.id <> p_booking_id
      and booking.status in (
        'PENDING_APPROVAL', 'APPROVED_AWAITING_DEPOSIT',
        'CONFIRMED', 'CHECKED_IN'
      )
  );

  return jsonb_build_object(
    'bookingId', p_booking_id,
    'bookingGroupId', target_booking.booking_group_id,
    'lodgingTotalSatang', lodging_total,
    'extraChargesSatang', extra_total,
    'totalSatang', lodging_total + extra_total,
    'depositSatang', group_deposit,
    'amountDueSatang', greatest(lodging_total + extra_total - group_deposit, 0),
    'refundDueSatang', greatest(group_deposit - lodging_total - extra_total, 0),
    'finalGroupCheckout', final_group_checkout,
    'plannedCheckOutDate', target_group.check_out_date,
    'earlyCheckout', target_group.check_out_date >
      (now() at time zone 'Asia/Bangkok')::date
  );
end;
$$;

create or replace function public.issue_receipt_snapshot_internal(
  p_booking_id uuid,
  p_payment_method public.checkout_payment_method,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_booking public.bookings%rowtype;
  target_group public.booking_groups%rowtype;
  target_stay public.room_stays%rowtype;
  target_tenant public.tenants%rowtype;
  clinic_address text;
  clinic_phone text;
  tax_enabled boolean;
  configured_tax_heading text;
  configured_tax_id text;
  configured_branch_number text;
  customer_name text;
  customer_phone text;
  room_summary text;
  pet_summary text;
  checked_in_at timestamptz;
  checked_out_at timestamptz;
  lodging_total integer;
  extra_total integer;
  group_deposit integer;
  grand_total integer;
  amount_due integer;
  refund_due integer;
  created_receipt_id uuid;
  created_receipt_no text;
  line_number integer := 1;
  booking_row record;
  charge_row record;
begin
  select * into target_booking from public.bookings booking
  where booking.id = p_booking_id;
  if target_booking.id is null or target_booking.status <> 'CHECKED_OUT' then
    raise exception using errcode = 'P0001', message = 'CHECKOUT_REQUIRED';
  end if;
  if exists (
    select 1 from public.bookings booking
    where booking.tenant_id = target_booking.tenant_id
      and booking.booking_group_id = target_booking.booking_group_id
      and booking.status in (
        'PENDING_APPROVAL', 'APPROVED_AWAITING_DEPOSIT',
        'CONFIRMED', 'CHECKED_IN'
      )
  ) then
    raise exception using errcode = 'P0001', message = 'GROUP_CHECKOUT_INCOMPLETE';
  end if;
  select receipt.id into created_receipt_id from public.receipts receipt
  where receipt.tenant_id = target_booking.tenant_id
    and receipt.booking_group_id = target_booking.booking_group_id
    and receipt.status = 'ISSUED' and receipt.is_group_receipt;
  if created_receipt_id is not null then return created_receipt_id; end if;

  select * into target_group from public.booking_groups booking_group
  where booking_group.id = target_booking.booking_group_id;
  select * into target_stay from public.room_stays stay
  where stay.tenant_id = target_booking.tenant_id
    and stay.booking_id = p_booking_id
  order by stay.checked_in_at desc limit 1;
  select * into target_tenant from public.tenants tenant
  where tenant.id = target_booking.tenant_id;
  select settings.clinic_address, settings.contact_phone,
    settings.receipt_tax_enabled, settings.receipt_tax_heading,
    settings.tax_id, settings.branch_number
  into clinic_address, clinic_phone, tax_enabled, configured_tax_heading,
    configured_tax_id, configured_branch_number
  from public.tenant_settings settings
  where settings.tenant_id = target_booking.tenant_id;
  tax_enabled := coalesce(tax_enabled, false);

  select customer.full_name, customer.phone into customer_name, customer_phone
  from public.customers customer where customer.id = target_group.customer_id;
  select
    string_agg(distinct room.room_code, ', ' order by room.room_code),
    min(stay.checked_in_at), max(stay.checked_out_at)
  into room_summary, checked_in_at, checked_out_at
  from public.room_stays stay
  join public.bookings booking
    on booking.tenant_id = stay.tenant_id and booking.id = stay.booking_id
  join public.room_inventory room
    on room.tenant_id = stay.tenant_id and room.id = stay.room_id
  where booking.tenant_id = target_booking.tenant_id
    and booking.booking_group_id = target_booking.booking_group_id
    and booking.status = 'CHECKED_OUT';
  select string_agg(
    pet.name || ' (' || case pet.species when 'CAT' then 'แมว' else 'สุนัข' end || ')',
    ', ' order by booking.booking_code, booking_pet.position
  ) into pet_summary
  from public.bookings booking
  join public.booking_pets booking_pet
    on booking_pet.tenant_id = booking.tenant_id
   and booking_pet.booking_id = booking.id
  join public.pets pet
    on pet.tenant_id = booking_pet.tenant_id and pet.id = booking_pet.pet_id
  where booking.tenant_id = target_booking.tenant_id
    and booking.booking_group_id = target_booking.booking_group_id
    and booking.status = 'CHECKED_OUT';
  select coalesce(sum(booking.lodging_total_satang), 0)::integer
  into lodging_total from public.bookings booking
  where booking.tenant_id = target_booking.tenant_id
    and booking.booking_group_id = target_booking.booking_group_id
    and booking.status = 'CHECKED_OUT';
  select coalesce(sum(charge.amount_satang), 0)::integer into extra_total
  from public.booking_charges charge
  join public.bookings booking
    on booking.tenant_id = charge.tenant_id and booking.id = charge.booking_id
  where booking.tenant_id = target_booking.tenant_id
    and booking.booking_group_id = target_booking.booking_group_id
    and booking.status = 'CHECKED_OUT';
  select coalesce(payment.amount_satang, 0) into group_deposit
  from public.payments payment
  where payment.tenant_id = target_booking.tenant_id
    and payment.booking_group_id = target_booking.booking_group_id
    and payment.payment_type = 'DEPOSIT' and payment.status = 'VERIFIED';
  group_deposit := coalesce(group_deposit, 0);
  grand_total := lodging_total + extra_total;
  amount_due := greatest(grand_total - group_deposit, 0);
  refund_due := greatest(group_deposit - grand_total, 0);
  created_receipt_no := public.next_receipt_number(target_booking.tenant_id);

  insert into public.receipts (
    tenant_id, booking_group_id, is_group_receipt, booking_id, room_stay_id,
    receipt_no, issued_at, issued_by,
    clinic_thai_name, clinic_english_name, clinic_address, clinic_phone,
    tax_section_enabled, tax_heading, tax_id, branch_number,
    customer_name, customer_phone, pet_summary, room_summary,
    actual_checked_in_at, actual_checked_out_at, quoted_nights,
    lodging_total_satang, extra_charges_satang, total_satang, deposit_satang,
    amount_due_satang, paid_at_checkout_satang, refund_due_satang,
    payment_method, payment_status, notes
  ) values (
    target_booking.tenant_id, target_booking.booking_group_id, true,
    target_booking.id, target_stay.id, created_receipt_no, now(), auth.uid(),
    target_tenant.thai_name, target_tenant.english_name, clinic_address,
    clinic_phone, tax_enabled,
    case when tax_enabled then configured_tax_heading end,
    case when tax_enabled then configured_tax_id end,
    case when tax_enabled then configured_branch_number end,
    customer_name, customer_phone, coalesce(pet_summary, '—'),
    coalesce(room_summary, '—'), checked_in_at, checked_out_at,
    (target_group.check_out_date - target_group.check_in_date)::smallint,
    lodging_total, extra_total, grand_total, group_deposit, amount_due,
    amount_due, refund_due, p_payment_method,
    case when refund_due > 0 then 'REFUND_DUE' else 'PAID' end,
    nullif(btrim(coalesce(p_notes, '')), '')
  ) returning id into created_receipt_id;

  for booking_row in
    select booking.id, booking.booking_code, booking.quoted_nights,
      booking.nightly_rate_satang, booking.lodging_total_satang,
      room.room_code,
      coalesce(string_agg(
        pet.name || ' (' || case pet.species when 'CAT' then 'แมว' else 'สุนัข' end || ')',
        ', ' order by booking_pet.position
      ), '') as pets
    from public.bookings booking
    join public.room_stays stay
      on stay.tenant_id = booking.tenant_id and stay.booking_id = booking.id
    join public.room_inventory room
      on room.tenant_id = stay.tenant_id and room.id = stay.room_id
    left join public.booking_pets booking_pet
      on booking_pet.tenant_id = booking.tenant_id
     and booking_pet.booking_id = booking.id
    left join public.pets pet
      on pet.tenant_id = booking_pet.tenant_id and pet.id = booking_pet.pet_id
    where booking.tenant_id = target_booking.tenant_id
      and booking.booking_group_id = target_booking.booking_group_id
      and booking.status = 'CHECKED_OUT'
    group by booking.id, room.room_code
    order by room.room_code, booking.booking_code
  loop
    insert into public.receipt_items (
      tenant_id, receipt_id, booking_id, line_no, item_type, item_name,
      description, pet_summary, room_summary, quantity, unit,
      unit_price_satang, amount_satang, service_date
    ) values (
      target_booking.tenant_id, created_receipt_id, booking_row.id,
      line_number, 'LODGING', 'ค่าที่พัก ' || booking_row.room_code,
      target_group.check_in_date || ' ถึง ' || target_group.check_out_date,
      booking_row.pets, booking_row.room_code, booking_row.quoted_nights, 'คืน',
      booking_row.nightly_rate_satang, booking_row.lodging_total_satang,
      target_group.check_out_date
    );
    line_number := line_number + 1;
  end loop;

  for charge_row in
    select charge.*, room.room_code
    from public.booking_charges charge
    join public.bookings booking
      on booking.tenant_id = charge.tenant_id and booking.id = charge.booking_id
    join public.room_stays stay
      on stay.tenant_id = charge.tenant_id and stay.id = charge.room_stay_id
    join public.room_inventory room
      on room.tenant_id = stay.tenant_id and room.id = stay.room_id
    where booking.tenant_id = target_booking.tenant_id
      and booking.booking_group_id = target_booking.booking_group_id
      and booking.status = 'CHECKED_OUT'
    order by room.room_code, charge.created_at, charge.id
  loop
    insert into public.receipt_items (
      tenant_id, receipt_id, booking_id, line_no, item_type, item_name,
      description, pet_summary, room_summary, quantity, unit,
      unit_price_satang, amount_satang, service_date
    ) values (
      target_booking.tenant_id, created_receipt_id, charge_row.booking_id,
      line_number, 'EXTRA',
      case charge_row.charge_type
        when 'FOOD' then 'ค่าอาหาร'
        when 'MEDICINE' then 'ค่ายา'
        when 'IV_FLUIDS' then 'ให้น้ำเกลือ'
        when 'BLOOD_TEST' then 'ตรวจเลือด'
        else coalesce(charge_row.description, 'ค่าใช้จ่ายอื่น ๆ')
      end,
      charge_row.description, null, charge_row.room_code,
      charge_row.quantity, 'รายการ', charge_row.unit_price_satang,
      charge_row.amount_satang, charge_row.service_date
    );
    line_number := line_number + 1;
  end loop;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    target_booking.tenant_id, auth.uid(), 'GROUP_RECEIPT_ISSUED', 'RECEIPT',
    created_receipt_id,
    jsonb_build_object('booking_group_id', target_booking.booking_group_id,
      'receipt_no', created_receipt_no, 'total_satang', grand_total,
      'deposit_satang', group_deposit, 'tax_section_enabled', tax_enabled)
  );
  return created_receipt_id;
end;
$$;

create or replace function public.check_out_booking(
  p_booking_id uuid,
  p_charges jsonb,
  p_payment jsonb,
  p_confirm_early_checkout boolean,
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
  target_group public.booking_groups%rowtype;
  target_stay public.room_stays%rowtype;
  target_room public.room_inventory%rowtype;
  claimed_key_id uuid;
  existing_key public.idempotency_keys%rowtype;
  request_hash text;
  charge jsonb;
  charge_type public.booking_charge_type;
  charge_amount integer;
  charge_detail text;
  lodging_total integer;
  extra_total integer;
  group_deposit integer;
  grand_total integer;
  amount_due integer;
  refund_due integer;
  payment_method public.checkout_payment_method := 'NOT_SPECIFIED';
  final_group_checkout boolean;
  receipt_id uuid;
  receipt_no text;
  response_payload jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  if p_expected_version is null
    or jsonb_typeof(coalesce(p_charges, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_charges, '[]'::jsonb)) > 50
    or char_length(coalesce(p_notes, '')) > 1000
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
    convert_to(concat_ws('|', p_booking_id, coalesce(p_charges, '[]'::jsonb)::text,
      coalesce(p_payment, '{}'::jsonb)::text, p_confirm_early_checkout,
      coalesce(p_notes, ''), p_expected_version), 'UTF8'), 'sha256'
  ), 'hex');
  insert into public.idempotency_keys (
    tenant_id, scope, idempotency_key, request_hash, expires_at
  ) values (
    target_tenant_id, 'CHECK_OUT', p_idempotency_key, request_hash,
    now() + interval '24 hours'
  ) on conflict (tenant_id, scope, idempotency_key) do nothing
  returning id into claimed_key_id;
  if claimed_key_id is null then
    select * into existing_key from public.idempotency_keys key
    where key.tenant_id = target_tenant_id and key.scope = 'CHECK_OUT'
      and key.idempotency_key = p_idempotency_key for update;
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
  if target_booking.status <> 'CHECKED_IN' then
    raise exception using errcode = 'P0001', message = 'INVALID_STATUS_TRANSITION';
  end if;
  select * into target_group from public.booking_groups booking_group
  where booking_group.id = target_booking.booking_group_id for update;
  if target_group.check_out_date > (now() at time zone 'Asia/Bangkok')::date
    and coalesce(p_confirm_early_checkout, false) is not true
  then
    raise exception using errcode = '22023', message = 'EARLY_CHECKOUT_CONFIRMATION_REQUIRED';
  end if;
  select * into target_stay from public.room_stays stay
  where stay.tenant_id = target_tenant_id and stay.booking_id = p_booking_id
    and stay.checked_out_at is null for update;
  if target_stay.id is null then
    raise exception using errcode = 'P0002', message = 'OPEN_STAY_NOT_FOUND';
  end if;
  select * into target_room from public.room_inventory room
  where room.id = target_stay.room_id for update;

  for charge in
    select value from jsonb_array_elements(coalesce(p_charges, '[]'::jsonb))
  loop
    begin
      charge_type := (charge ->> 'category')::public.booking_charge_type;
      charge_amount := (charge ->> 'amountSatang')::integer;
    exception when others then
      raise exception using errcode = '22023', message = 'INVALID_CHARGE';
    end;
    charge_detail := nullif(btrim(coalesce(charge ->> 'detail', '')), '');
    if charge_amount <= 0 or char_length(coalesce(charge_detail, '')) > 150
      or (charge_type = 'OTHER' and charge_detail is null)
    then
      raise exception using errcode = '22023', message = 'INVALID_CHARGE';
    end if;
    insert into public.booking_charges (
      tenant_id, booking_id, room_stay_id, charge_type, description,
      quantity, unit_price_satang, amount_satang, service_date, created_by
    ) values (
      target_tenant_id, p_booking_id, target_stay.id, charge_type, charge_detail,
      1, charge_amount, charge_amount,
      (now() at time zone 'Asia/Bangkok')::date, auth.uid()
    );
  end loop;

  update public.room_stays
  set checked_out_at = now(), checked_out_by = auth.uid(),
      check_out_notes = nullif(btrim(coalesce(p_notes, '')), '')
  where id = target_stay.id;
  update public.room_allocations
  set status = 'RELEASED', released_at = now(), release_reason = 'CHECK_OUT'
  where tenant_id = target_tenant_id and booking_id = p_booking_id
    and status in ('HOLD', 'RESERVED');
  update public.room_inventory
  set operational_status = 'CLEANING', version = version + 1
  where id = target_room.id;
  update public.bookings set status = 'CHECKED_OUT'
  where id = target_booking.id;

  final_group_checkout := not exists (
    select 1 from public.bookings booking
    where booking.tenant_id = target_tenant_id
      and booking.booking_group_id = target_booking.booking_group_id
      and booking.status in (
        'PENDING_APPROVAL', 'APPROVED_AWAITING_DEPOSIT',
        'CONFIRMED', 'CHECKED_IN'
      )
  );
  select coalesce(sum(booking.lodging_total_satang), 0)::integer
  into lodging_total from public.bookings booking
  where booking.tenant_id = target_tenant_id
    and booking.booking_group_id = target_booking.booking_group_id
    and booking.status = 'CHECKED_OUT';
  select coalesce(sum(charge.amount_satang), 0)::integer into extra_total
  from public.booking_charges charge
  join public.bookings booking
    on booking.tenant_id = charge.tenant_id and booking.id = charge.booking_id
  where booking.tenant_id = target_tenant_id
    and booking.booking_group_id = target_booking.booking_group_id
    and booking.status = 'CHECKED_OUT';
  select coalesce(payment.amount_satang, 0) into group_deposit
  from public.payments payment
  where payment.tenant_id = target_tenant_id
    and payment.booking_group_id = target_booking.booking_group_id
    and payment.payment_type = 'DEPOSIT' and payment.status = 'VERIFIED';
  group_deposit := coalesce(group_deposit, 0);
  grand_total := lodging_total + extra_total;
  amount_due := greatest(grand_total - group_deposit, 0);
  refund_due := greatest(group_deposit - grand_total, 0);

  if final_group_checkout then
    begin
      payment_method := coalesce(
        nullif(p_payment ->> 'method', '')::public.checkout_payment_method,
        'NOT_SPECIFIED'::public.checkout_payment_method
      );
    exception when others then
      raise exception using errcode = '22023', message = 'INVALID_PAYMENT_METHOD';
    end;
    if amount_due > 0 then
      insert into public.payments (
        tenant_id, booking_group_id, booking_id, payment_type,
        amount_satang, status, payment_method, submitted_at, verified_at,
        verified_by, notes
      ) values (
        target_tenant_id, target_booking.booking_group_id, null, 'CHECKOUT',
        amount_due, 'VERIFIED', payment_method, now(), now(), auth.uid(),
        'รับชำระรวมของ booking group ณ เช็กเอาต์ห้องสุดท้าย'
      );
    end if;
    update public.bookings
    set payment_status = case when refund_due > 0 then 'REFUND_DUE'
      else payment_status end
    where tenant_id = target_tenant_id
      and booking_group_id = target_booking.booking_group_id
      and status = 'CHECKED_OUT';
    receipt_id := public.issue_receipt_snapshot_internal(
      p_booking_id, payment_method, p_notes
    );
    select receipt.receipt_no into receipt_no from public.receipts receipt
    where receipt.id = receipt_id;
  end if;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id,
    before_summary, after_summary
  ) values (
    target_tenant_id, auth.uid(), 'BOOKING_CHECKED_OUT', 'ROOM_STAY',
    target_stay.id,
    jsonb_build_object('booking_status', target_booking.status,
      'room_status', target_room.operational_status),
    jsonb_build_object('booking_status', 'CHECKED_OUT',
      'room_status', 'CLEANING', 'booking_group_id', target_booking.booking_group_id,
      'final_group_checkout', final_group_checkout,
      'group_total_satang', grand_total, 'group_deposit_satang', group_deposit,
      'amount_due_satang', case when final_group_checkout then amount_due end,
      'refund_due_satang', case when final_group_checkout then refund_due end,
      'receipt_id', receipt_id)
  );
  response_payload := jsonb_build_object(
    'bookingId', p_booking_id, 'bookingGroupId', target_booking.booking_group_id,
    'stayId', target_stay.id, 'finalGroupCheckout', final_group_checkout,
    'receiptId', receipt_id, 'receiptNo', receipt_no,
    'lodgingTotalSatang', lodging_total, 'extraChargesSatang', extra_total,
    'totalSatang', grand_total, 'depositSatang', group_deposit,
    'amountDueSatang', case when final_group_checkout then amount_due end,
    'refundDueSatang', case when final_group_checkout then refund_due end,
    'roomStatus', 'CLEANING'
  );
  update public.idempotency_keys set result = response_payload
  where id = claimed_key_id;
  return response_payload;
end;
$$;

create or replace function public.record_refund(
  p_payment_id uuid,
  p_account_name text,
  p_account_number text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  original_payment public.payments%rowtype;
  target_receipt public.receipts%rowtype;
  normalized_name text := lower(regexp_replace(coalesce(p_account_name, ''), '\s+', '', 'g'));
  account_digits text := regexp_replace(coalesce(p_account_number, ''), '[^0-9]', '', 'g');
  refund_id uuid;
begin
  select * into original_payment from public.payments payment
  where payment.id = p_payment_id and payment.payment_type = 'DEPOSIT' for update;
  if original_payment.id is null then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;
  if not public.has_tenant_role(
    original_payment.tenant_id, array['OWNER']::public.clinic_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  select * into target_receipt from public.receipts receipt
  where receipt.tenant_id = original_payment.tenant_id
    and receipt.booking_group_id = original_payment.booking_group_id
    and receipt.status = 'ISSUED' and receipt.is_group_receipt for update;
  if target_receipt.id is null or target_receipt.refund_due_satang <= 0 then
    raise exception using errcode = '22023', message = 'REFUND_NOT_DUE';
  end if;
  if original_payment.source_account_name_normalized is null
    or original_payment.source_account_last4 is null
  then
    raise exception using errcode = '22023', message = 'ORIGINAL_ACCOUNT_EVIDENCE_REQUIRED';
  end if;
  if normalized_name <> original_payment.source_account_name_normalized
    or right(account_digits, 4) <> original_payment.source_account_last4
  then
    raise exception using errcode = '22023', message = 'REFUND_ACCOUNT_MISMATCH';
  end if;
  if char_length(coalesce(p_notes, '')) > 1000 then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  insert into public.payments (
    tenant_id, booking_group_id, booking_id, payment_type, amount_satang,
    status, matching_original_payment_id, refund_account_name,
    refund_account_number_masked, refunded_at, refunded_by, notes
  ) values (
    original_payment.tenant_id, original_payment.booking_group_id, null,
    'REFUND', target_receipt.refund_due_satang, 'REFUNDED', original_payment.id,
    btrim(p_account_name), '****' || right(account_digits, 4), now(), auth.uid(),
    nullif(btrim(coalesce(p_notes, '')), '')
  ) returning id into refund_id;
  update public.bookings set payment_status = 'REFUNDED'
  where tenant_id = original_payment.tenant_id
    and booking_group_id = original_payment.booking_group_id;
  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    original_payment.tenant_id, auth.uid(), 'REFUND_RECORDED', 'PAYMENT',
    refund_id,
    jsonb_build_object('booking_group_id', original_payment.booking_group_id,
      'amount_satang', target_receipt.refund_due_satang,
      'matching_original_payment_id', original_payment.id)
  );
  return refund_id;
end;
$$;

comment on column public.payments.booking_group_id is
  'Financial scope. LINE deposit, final checkout payment, and refund are one fact per booking group.';
comment on column public.receipts.booking_group_id is
  'Group settled by this immutable receipt. receipt_items retain booking_id for room-unit traceability.';
