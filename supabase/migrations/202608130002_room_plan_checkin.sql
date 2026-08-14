create or replace function public.check_in_room_booking(
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
  target_booking public.bookings%rowtype;
  target_channel public.booking_channel;
  target_line_user_id text;
  confirmed_version integer;
  original_status public.booking_status;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  if p_booking_id is null or p_room_id is null
    or p_deposit_satang is null or p_deposit_satang < 0
    or p_expected_version is null
    or char_length(coalesce(p_notes, '')) > 1500
    or char_length(coalesce(p_idempotency_key, '')) not between 16 and 200
  then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
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

  select booking_group.channel, customer.line_user_id
  into target_channel, target_line_user_id
  from public.booking_groups booking_group
  join public.customers customer
    on customer.tenant_id = booking_group.tenant_id
   and customer.id = booking_group.customer_id
  where booking_group.tenant_id = target_booking.tenant_id
    and booking_group.id = target_booking.booking_group_id
  for update of booking_group, customer;

  if target_channel = 'LINE' then
    if nullif(btrim(coalesce(target_line_user_id, '')), '') is null then
      raise exception using errcode = '22023', message = 'LINE_ID_REQUIRED';
    end if;
    if p_deposit_satang < 50000 then
      raise exception using errcode = '22023', message = 'LINE_DEPOSIT_REQUIRED';
    end if;
  end if;

  if target_booking.status = 'CHECKED_IN' then
    return public.check_in_booking(
      p_booking_id,
      p_room_id,
      p_deposit_satang,
      p_notes,
      p_expected_version,
      p_idempotency_key
    );
  end if;
  if target_booking.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;
  if target_booking.status not in (
    'PENDING_APPROVAL',
    'APPROVED_AWAITING_DEPOSIT',
    'CONFIRMED'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_STATUS_TRANSITION';
  end if;

  confirmed_version := target_booking.version;
  if target_booking.status in (
    'PENDING_APPROVAL',
    'APPROVED_AWAITING_DEPOSIT'
  ) then
    original_status := target_booking.status;
    update public.bookings booking
    set status = 'CONFIRMED',
        payment_status = case
          when p_deposit_satang > 0 then 'VERIFIED'::public.payment_status
          else 'NOT_REQUIRED'::public.payment_status
        end,
        confirmed_at = coalesce(booking.confirmed_at, now()),
        reviewed_at = coalesce(booking.reviewed_at, now()),
        reviewed_by = coalesce(booking.reviewed_by, auth.uid()),
        rejection_reason = null,
        deposit_deadline_at = null
    where booking.id = target_booking.id
    returning booking.version into confirmed_version;

    insert into public.audit_logs (
      tenant_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      before_summary,
      after_summary
    ) values (
      target_booking.tenant_id,
      auth.uid(),
      'BOOKING_APPROVED_FOR_ROOM_CHECK_IN',
      'BOOKING',
      target_booking.id,
      jsonb_build_object(
        'status', original_status,
        'version', target_booking.version
      ),
      jsonb_build_object(
        'status', 'CONFIRMED',
        'version', confirmed_version,
        'room_id', p_room_id,
        'channel', target_channel,
        'group_deposit_satang', p_deposit_satang
      )
    );
  end if;

  return public.check_in_booking(
    p_booking_id,
    p_room_id,
    p_deposit_satang,
    p_notes,
    confirmed_version,
    p_idempotency_key
  );
end;
$$;

comment on function public.check_in_room_booking(
  uuid, uuid, integer, text, integer, text
) is
  'Atomically approves an eligible held booking when needed and checks it into its room from the room-planning screen.';

revoke all on function public.check_in_room_booking(
  uuid, uuid, integer, text, integer, text
) from public, anon;
grant execute on function public.check_in_room_booking(
  uuid, uuid, integer, text, integer, text
) to authenticated;
