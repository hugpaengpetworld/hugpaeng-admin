alter table public.bookings
  drop constraint if exists bookings_nightly_rate_satang_check,
  drop constraint if exists bookings_rate_matches_count;

alter table public.bookings
  add constraint bookings_nightly_rate_satang_positive
  check (nightly_rate_satang > 0);

create or replace function public.create_priced_back_office_booking(
  p_tenant_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_line_user_id text,
  p_channel public.booking_channel,
  p_check_in_date date,
  p_check_out_date date,
  p_customer_notes text,
  p_units jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_result jsonb;
  created_entry jsonb;
  unit jsonb;
  unit_position bigint;
  unit_rate integer;
  standard_rate integer;
  calculated_nights integer := p_check_out_date - p_check_in_date;
  created_booking_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  if not public.has_tenant_role(
    p_tenant_id,
    array['OWNER', 'DOCTOR', 'STAFF']::public.clinic_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if calculated_nights < 1
    or jsonb_typeof(p_units) <> 'array'
    or jsonb_array_length(p_units) not between 1 and 18
  then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  for unit in select value from jsonb_array_elements(p_units)
  loop
    if coalesce(unit->>'nightlyRateSatang', '') !~ '^[1-9][0-9]{0,9}$' then
      raise exception using errcode = '22023', message = 'CUSTOM_NIGHTLY_RATE_INVALID';
    end if;
    begin
      unit_rate := (unit->>'nightlyRateSatang')::integer;
    exception when numeric_value_out_of_range then
      raise exception using errcode = '22023', message = 'CUSTOM_NIGHTLY_RATE_INVALID';
    end;
    if unit_rate::bigint * calculated_nights > 2147483647 then
      raise exception using errcode = '22023', message = 'CUSTOM_NIGHTLY_RATE_INVALID';
    end if;
  end loop;

  booking_result := public.create_booking_group_internal(
    p_tenant_id,
    p_customer_name,
    p_customer_phone,
    p_line_user_id,
    p_channel,
    p_check_in_date,
    p_check_out_date,
    p_customer_notes,
    p_units,
    auth.uid(),
    false
  );

  for created_entry, unit_position in
    select entry.value, entry.ordinality
    from jsonb_array_elements(booking_result->'bookings')
      with ordinality as entry(value, ordinality)
  loop
    unit := p_units->((unit_position - 1)::integer);
    unit_rate := (unit->>'nightlyRateSatang')::integer;
    standard_rate := case jsonb_array_length(unit->'pets')
      when 1 then 15000 else 20000 end;
    created_booking_id := (created_entry->>'bookingId')::uuid;

    update public.bookings booking
    set nightly_rate_satang = unit_rate,
        lodging_total_satang = unit_rate * calculated_nights
    where booking.tenant_id = p_tenant_id
      and booking.id = created_booking_id;

    insert into public.audit_logs (
      tenant_id, actor_user_id, action, entity_type, entity_id,
      before_summary, after_summary
    ) values (
      p_tenant_id, auth.uid(), 'BOOKING_NIGHTLY_RATE_QUOTED',
      'BOOKING', created_booking_id,
      jsonb_build_object('standard_nightly_rate_satang', standard_rate),
      jsonb_build_object(
        'nightly_rate_satang', unit_rate,
        'quoted_nights', calculated_nights,
        'lodging_total_satang', unit_rate * calculated_nights
      )
    );
  end loop;

  return booking_result;
end;
$$;

revoke all on function public.create_priced_back_office_booking(
  uuid, text, text, text, public.booking_channel, date, date, text, jsonb
) from public, anon;
grant execute on function public.create_priced_back_office_booking(
  uuid, text, text, text, public.booking_channel, date, date, text, jsonb
) to authenticated;

create or replace function public.create_and_check_in_back_office_booking(
  p_tenant_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_line_user_id text,
  p_channel public.booking_channel,
  p_check_in_date date,
  p_check_out_date date,
  p_customer_notes text,
  p_units jsonb,
  p_deposit_satang integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_key_id uuid;
  existing_key public.idempotency_keys%rowtype;
  request_hash text;
  booking_result jsonb;
  response_payload jsonb;
  created_entry jsonb;
  unit_position bigint;
  created_booking_id uuid;
  selected_room_id uuid;
  confirmed_version integer;
  child_idempotency_key text;
  check_in_result jsonb;
  checked_in_units jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  if not public.has_tenant_role(
    p_tenant_id,
    array['OWNER', 'DOCTOR', 'STAFF']::public.clinic_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if p_deposit_satang is null or p_deposit_satang < 0
    or char_length(coalesce(p_idempotency_key, '')) not between 16 and 200
  then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  if p_channel = 'LINE' and p_deposit_satang < 50000 then
    raise exception using errcode = '22023', message = 'LINE_DEPOSIT_REQUIRED';
  end if;

  request_hash := encode(extensions.digest(
    convert_to(concat_ws('|',
      p_tenant_id, p_customer_name, p_customer_phone,
      coalesce(p_line_user_id, ''), p_channel, p_check_in_date,
      p_check_out_date, coalesce(p_customer_notes, ''), p_units::text,
      p_deposit_satang
    ), 'UTF8'),
    'sha256'
  ), 'hex');

  delete from public.idempotency_keys key
  where key.tenant_id = p_tenant_id
    and key.scope = 'DIRECT_BACK_OFFICE_CHECK_IN'
    and key.idempotency_key = p_idempotency_key
    and key.expires_at <= now();

  insert into public.idempotency_keys (
    tenant_id, scope, idempotency_key, request_hash, expires_at
  ) values (
    p_tenant_id, 'DIRECT_BACK_OFFICE_CHECK_IN', p_idempotency_key,
    request_hash, now() + interval '24 hours'
  ) on conflict (tenant_id, scope, idempotency_key) do nothing
  returning id into claimed_key_id;

  if claimed_key_id is null then
    select * into existing_key
    from public.idempotency_keys key
    where key.tenant_id = p_tenant_id
      and key.scope = 'DIRECT_BACK_OFFICE_CHECK_IN'
      and key.idempotency_key = p_idempotency_key
    for update;
    if existing_key.request_hash <> request_hash then
      raise exception using errcode = '22023', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return coalesce(existing_key.result, '{}'::jsonb)
      || jsonb_build_object('idempotencyReplay', true);
  end if;

  booking_result := public.create_priced_back_office_booking(
    p_tenant_id,
    p_customer_name,
    p_customer_phone,
    p_line_user_id,
    p_channel,
    p_check_in_date,
    p_check_out_date,
    p_customer_notes,
    p_units
  );

  for created_entry, unit_position in
    select entry.value, entry.ordinality
    from jsonb_array_elements(booking_result->'bookings')
      with ordinality as entry(value, ordinality)
  loop
    created_booking_id := (created_entry->>'bookingId')::uuid;
    selected_room_id := (
      p_units->((unit_position - 1)::integer)->>'roomId'
    )::uuid;

    update public.bookings booking
    set status = 'CONFIRMED',
        payment_status = case
          when p_deposit_satang > 0 then 'VERIFIED'::public.payment_status
          else 'NOT_REQUIRED'::public.payment_status
        end,
        version = booking.version + 1
    where booking.tenant_id = p_tenant_id
      and booking.id = created_booking_id
      and booking.status = 'PENDING_APPROVAL'
    returning booking.version into confirmed_version;
    if confirmed_version is null then
      raise exception using errcode = 'P0001', message = 'INVALID_STATUS_TRANSITION';
    end if;

    child_idempotency_key := encode(extensions.digest(
      convert_to(p_idempotency_key || ':' || unit_position::text, 'UTF8'),
      'sha256'
    ), 'hex');
    check_in_result := public.check_in_booking(
      created_booking_id,
      selected_room_id,
      p_deposit_satang,
      'เช็คอินทันทีจากหน้าวางแผนห้องพัก',
      confirmed_version,
      child_idempotency_key
    );
    checked_in_units := checked_in_units || jsonb_build_array(check_in_result);
  end loop;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    p_tenant_id, auth.uid(), 'DIRECT_BACK_OFFICE_CHECK_IN_COMPLETED',
    'BOOKING_GROUP', (booking_result->>'bookingGroupId')::uuid,
    jsonb_build_object(
      'room_count', jsonb_array_length(p_units),
      'group_deposit_satang', p_deposit_satang,
      'status', 'CHECKED_IN'
    )
  );

  response_payload := booking_result || jsonb_build_object(
    'status', 'CHECKED_IN',
    'checkedInUnits', checked_in_units
  );
  update public.idempotency_keys
  set result = response_payload
  where id = claimed_key_id;
  return response_payload;
end;
$$;

revoke all on function public.create_and_check_in_back_office_booking(
  uuid, text, text, text, public.booking_channel, date, date, text, jsonb,
  integer, text
) from public, anon;
grant execute on function public.create_and_check_in_back_office_booking(
  uuid, text, text, text, public.booking_channel, date, date, text, jsonb,
  integer, text
) to authenticated;
