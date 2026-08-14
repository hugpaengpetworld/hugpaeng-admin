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
    update public.bookings as booking
    set status = 'REJECTED', reviewed_at = now(), reviewed_by = auth.uid(),
        rejection_reason = clean_reason
    where booking.id = target_booking.id;
    update public.room_allocations as allocation
    set status = 'RELEASED', released_at = now(),
        release_reason = 'BOOKING_REJECTED'
    where allocation.tenant_id = target_booking.tenant_id
      and allocation.booking_id = target_booking.id
      and allocation.status in ('HOLD', 'RESERVED');

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

    select payment.* into target_payment from public.payments payment
    where payment.tenant_id = target_booking.tenant_id
      and payment.booking_group_id = target_booking.booking_group_id
      and payment.payment_type = 'DEPOSIT'
    for update of payment;

    if target_payment.id is not null and target_payment.status = 'VERIFIED' then
      update public.bookings as booking
      set status = 'CONFIRMED', payment_status = 'VERIFIED',
          confirmed_at = now(), reviewed_at = now(), reviewed_by = auth.uid(),
          rejection_reason = null, deposit_deadline_at = null
      where booking.id = target_booking.id;
      update public.room_allocations as allocation set status = 'RESERVED'
      where allocation.tenant_id = target_booking.tenant_id
        and allocation.booking_id = target_booking.id
        and allocation.status = 'HOLD';
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

      update public.bookings as booking
      set status = 'APPROVED_AWAITING_DEPOSIT',
          payment_status = target_payment.status,
          deposit_deadline_at = deadline, reviewed_at = now(),
          reviewed_by = auth.uid(), rejection_reason = null
      where booking.id = target_booking.id;

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
    update public.bookings as booking
    set status = 'CONFIRMED', payment_status = 'NOT_REQUIRED',
        confirmed_at = now(), reviewed_at = now(), reviewed_by = auth.uid(),
        rejection_reason = null
    where booking.id = target_booking.id;
    update public.room_allocations as allocation set status = 'RESERVED'
    where allocation.tenant_id = target_booking.tenant_id
      and allocation.booking_id = target_booking.id
      and allocation.status = 'HOLD';
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

comment on function public.review_booking(uuid, text, text, integer) is
  'Reviews one booking unit. All relation columns are qualified to avoid collisions with table-return output names.';
