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
  clinic_phone text;
  customer_name text;
  customer_phone text;
  room_code text;
  pet_summary text;
  extra_total integer;
  grand_total integer;
  amount_due integer;
  refund_due integer;
  created_receipt_id uuid;
  created_receipt_no text;
  line_number integer := 2;
  charge_row public.booking_charges%rowtype;
begin
  select * into target_booking from public.bookings booking
  where booking.id = p_booking_id;
  if target_booking.id is null or target_booking.status <> 'CHECKED_OUT' then
    raise exception using errcode = 'P0001', message = 'CHECKOUT_REQUIRED';
  end if;
  if exists (
    select 1 from public.receipts receipt
    where receipt.tenant_id = target_booking.tenant_id
      and receipt.booking_id = p_booking_id and receipt.status = 'ISSUED'
  ) then
    select receipt.id into created_receipt_id from public.receipts receipt
    where receipt.tenant_id = target_booking.tenant_id
      and receipt.booking_id = p_booking_id and receipt.status = 'ISSUED';
    return created_receipt_id;
  end if;

  select * into target_group from public.booking_groups booking_group
  where booking_group.id = target_booking.booking_group_id;
  select * into target_stay from public.room_stays stay
  where stay.tenant_id = target_booking.tenant_id and stay.booking_id = p_booking_id
  order by stay.checked_in_at desc limit 1;
  select * into target_tenant from public.tenants tenant
  where tenant.id = target_booking.tenant_id;
  select settings.contact_phone into clinic_phone from public.tenant_settings settings
  where settings.tenant_id = target_booking.tenant_id;
  select customer.full_name, customer.phone into customer_name, customer_phone
  from public.customers customer where customer.id = target_group.customer_id;
  select room.room_code into room_code from public.room_inventory room
  where room.id = target_stay.room_id;
  select string_agg(
    pet.name || ' (' || case pet.species when 'CAT' then 'แมว' else 'สุนัข' end || ')',
    ', ' order by booking_pet.position
  ) into pet_summary
  from public.booking_pets booking_pet
  join public.pets pet on pet.tenant_id = booking_pet.tenant_id
    and pet.id = booking_pet.pet_id
  where booking_pet.tenant_id = target_booking.tenant_id
    and booking_pet.booking_id = p_booking_id;

  select coalesce(sum(charge.amount_satang), 0)::integer into extra_total
  from public.booking_charges charge
  where charge.tenant_id = target_booking.tenant_id and charge.booking_id = p_booking_id;
  grand_total := target_booking.lodging_total_satang + extra_total;
  amount_due := greatest(grand_total - target_stay.deposit_satang, 0);
  refund_due := greatest(target_stay.deposit_satang - grand_total, 0);
  created_receipt_no := public.next_receipt_number(target_booking.tenant_id);

  insert into public.receipts (
    tenant_id, booking_id, room_stay_id, receipt_no, issued_at, issued_by,
    clinic_thai_name, clinic_english_name, clinic_phone,
    customer_name, customer_phone, pet_summary, room_summary,
    actual_checked_in_at, actual_checked_out_at, quoted_nights,
    lodging_total_satang, extra_charges_satang, total_satang, deposit_satang,
    amount_due_satang, paid_at_checkout_satang, refund_due_satang,
    payment_method, payment_status, notes
  ) values (
    target_booking.tenant_id, target_booking.id, target_stay.id,
    created_receipt_no, now(), auth.uid(), target_tenant.thai_name,
    target_tenant.english_name, clinic_phone, customer_name, customer_phone,
    coalesce(pet_summary, case target_booking.species when 'CAT' then 'แมว' else 'สุนัข' end),
    room_code, target_stay.checked_in_at, target_stay.checked_out_at,
    target_booking.quoted_nights, target_booking.lodging_total_satang,
    extra_total, grand_total, target_stay.deposit_satang, amount_due,
    amount_due, refund_due, p_payment_method,
    case when refund_due > 0 then 'REFUND_DUE' else 'PAID' end,
    nullif(btrim(coalesce(p_notes, '')), '')
  ) returning id into created_receipt_id;

  insert into public.receipt_items (
    tenant_id, receipt_id, booking_id, line_no, item_type, item_name,
    description, pet_summary, room_summary, quantity, unit,
    unit_price_satang, amount_satang, service_date
  ) values (
    target_booking.tenant_id, created_receipt_id, target_booking.id, 1,
    'LODGING', 'ค่าที่พัก',
    target_group.check_in_date || ' ถึง ' || target_group.check_out_date,
    coalesce(pet_summary, ''), room_code, target_booking.quoted_nights, 'คืน',
    target_booking.nightly_rate_satang, target_booking.lodging_total_satang,
    target_group.check_out_date
  );

  for charge_row in
    select * from public.booking_charges charge
    where charge.tenant_id = target_booking.tenant_id
      and charge.booking_id = target_booking.id
    order by charge.created_at, charge.id
  loop
    insert into public.receipt_items (
      tenant_id, receipt_id, booking_id, line_no, item_type, item_name,
      description, pet_summary, room_summary, quantity, unit,
      unit_price_satang, amount_satang, service_date
    ) values (
      target_booking.tenant_id, created_receipt_id, target_booking.id,
      line_number, 'EXTRA',
      case charge_row.charge_type
        when 'FOOD' then 'ค่าอาหาร'
        when 'MEDICINE' then 'ค่ายา'
        when 'IV_FLUIDS' then 'ให้น้ำเกลือ'
        when 'BLOOD_TEST' then 'ตรวจเลือด'
        else coalesce(charge_row.description, 'ค่าใช้จ่ายอื่น ๆ')
      end,
      charge_row.description, null, room_code, charge_row.quantity, 'รายการ',
      charge_row.unit_price_satang, charge_row.amount_satang,
      charge_row.service_date
    );
    line_number := line_number + 1;
  end loop;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    target_booking.tenant_id, auth.uid(), 'RECEIPT_ISSUED', 'RECEIPT',
    created_receipt_id, jsonb_build_object('receipt_no', created_receipt_no,
      'total_satang', grand_total, 'booking_id', target_booking.id)
  );
  return created_receipt_id;
end;
$$;

revoke all on function public.issue_receipt_snapshot_internal(
  uuid, public.checkout_payment_method, text
) from public, anon, authenticated;

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
  extra_total integer := 0;
  grand_total integer;
  amount_due integer;
  refund_due integer;
  payment_method public.checkout_payment_method;
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
  if target_booking.status <> 'CHECKED_IN' then
    raise exception using errcode = 'P0001', message = 'INVALID_STATUS_TRANSITION';
  end if;
  select * into target_group from public.booking_groups booking_group
  where booking_group.id = target_booking.booking_group_id;
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

  for charge in select value from jsonb_array_elements(coalesce(p_charges, '[]'::jsonb))
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
    extra_total := extra_total + charge_amount;
  end loop;

  grand_total := target_booking.lodging_total_satang + extra_total;
  amount_due := greatest(grand_total - target_stay.deposit_satang, 0);
  refund_due := greatest(target_stay.deposit_satang - grand_total, 0);
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
      tenant_id, booking_id, payment_type, amount_satang, status,
      payment_method, submitted_at, verified_at, verified_by, notes
    ) values (
      target_tenant_id, p_booking_id, 'CHECKOUT', amount_due, 'VERIFIED',
      payment_method, now(), now(), auth.uid(), 'รับชำระ ณ เช็กเอาต์'
    );
  end if;

  update public.room_stays set checked_out_at = now(), checked_out_by = auth.uid(),
    check_out_notes = nullif(btrim(coalesce(p_notes, '')), '')
  where id = target_stay.id;
  update public.room_allocations set status = 'RELEASED', released_at = now(),
    release_reason = 'CHECK_OUT'
  where tenant_id = target_tenant_id and booking_id = p_booking_id
    and status in ('HOLD', 'RESERVED');
  update public.room_inventory set operational_status = 'CLEANING',
    version = version + 1 where id = target_room.id;
  update public.bookings set status = 'CHECKED_OUT',
    payment_status = case when refund_due > 0 then 'REFUND_DUE' else payment_status end
  where id = target_booking.id;

  receipt_id := public.issue_receipt_snapshot_internal(
    p_booking_id, payment_method, p_notes
  );
  select receipt.receipt_no into receipt_no from public.receipts receipt
  where receipt.id = receipt_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id,
    before_summary, after_summary
  ) values (
    target_tenant_id, auth.uid(), 'BOOKING_CHECKED_OUT', 'ROOM_STAY',
    target_stay.id,
    jsonb_build_object('booking_status', target_booking.status,
      'room_status', target_room.operational_status),
    jsonb_build_object('booking_status', 'CHECKED_OUT', 'room_status', 'CLEANING',
      'total_satang', grand_total, 'deposit_satang', target_stay.deposit_satang,
      'amount_due_satang', amount_due, 'refund_due_satang', refund_due,
      'receipt_id', receipt_id)
  );

  response_payload := jsonb_build_object(
    'bookingId', p_booking_id, 'stayId', target_stay.id,
    'receiptId', receipt_id, 'receiptNo', receipt_no,
    'lodgingTotalSatang', target_booking.lodging_total_satang,
    'extraChargesSatang', extra_total, 'totalSatang', grand_total,
    'depositSatang', target_stay.deposit_satang,
    'amountDueSatang', amount_due, 'refundDueSatang', refund_due,
    'roomStatus', 'CLEANING'
  );
  update public.idempotency_keys set result = response_payload where id = claimed_key_id;
  return response_payload;
end;
$$;

revoke all on function public.check_out_booking(
  uuid, jsonb, jsonb, boolean, text, integer, text
) from public, anon;
grant execute on function public.check_out_booking(
  uuid, jsonb, jsonb, boolean, text, integer, text
) to authenticated;

create or replace function public.record_deposit_source_account(
  p_payment_id uuid,
  p_account_name text,
  p_account_last4 text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_payment public.payments%rowtype;
  normalized_name text := lower(regexp_replace(coalesce(p_account_name, ''), '\s+', '', 'g'));
begin
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
  if target_payment.payment_type <> 'DEPOSIT' or target_payment.status <> 'VERIFIED'
    or normalized_name = '' or p_account_last4 is null
    or p_account_last4 !~ '^[0-9]{4}$'
  then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  update public.payments set source_account_name_normalized = normalized_name,
    source_account_last4 = p_account_last4 where id = target_payment.id;
  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    target_payment.tenant_id, auth.uid(), 'DEPOSIT_SOURCE_ACCOUNT_RECORDED',
    'PAYMENT', target_payment.id,
    jsonb_build_object('has_account_name', true, 'account_last4', p_account_last4)
  );
end;
$$;

revoke all on function public.record_deposit_source_account(uuid, text, text)
  from public, anon;
grant execute on function public.record_deposit_source_account(uuid, text, text)
  to authenticated;

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
    and receipt.booking_id = original_payment.booking_id
    and receipt.status = 'ISSUED' for update;
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
    tenant_id, booking_id, payment_type, amount_satang, status,
    matching_original_payment_id, refund_account_name,
    refund_account_number_masked, refunded_at, refunded_by, notes
  ) values (
    original_payment.tenant_id, original_payment.booking_id, 'REFUND',
    target_receipt.refund_due_satang, 'REFUNDED', original_payment.id,
    btrim(p_account_name), '****' || right(account_digits, 4), now(), auth.uid(),
    nullif(btrim(coalesce(p_notes, '')), '')
  ) returning id into refund_id;
  update public.bookings set payment_status = 'REFUNDED'
  where id = original_payment.booking_id;
  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    original_payment.tenant_id, auth.uid(), 'REFUND_RECORDED', 'PAYMENT', refund_id,
    jsonb_build_object('booking_id', original_payment.booking_id,
      'amount_satang', target_receipt.refund_due_satang,
      'matching_original_payment_id', original_payment.id)
  );
  return refund_id;
end;
$$;

revoke all on function public.record_refund(uuid, text, text, text)
  from public, anon;
grant execute on function public.record_refund(uuid, text, text, text)
  to authenticated;

create or replace function public.void_receipt(
  p_receipt_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_receipt public.receipts%rowtype;
  clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into target_receipt from public.receipts receipt
  where receipt.id = p_receipt_id for update;
  if target_receipt.id is null then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;
  if not public.has_tenant_role(
    target_receipt.tenant_id, array['OWNER']::public.clinic_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if target_receipt.status <> 'ISSUED' then
    raise exception using errcode = '22023', message = 'RECEIPT_ALREADY_VOID';
  end if;
  if clean_reason is null or char_length(clean_reason) > 500 then
    raise exception using errcode = '22023', message = 'REASON_REQUIRED';
  end if;
  update public.receipts set status = 'VOID', voided_at = now(),
    voided_by = auth.uid(), void_reason = clean_reason
  where id = target_receipt.id;
  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id,
    before_summary, after_summary
  ) values (
    target_receipt.tenant_id, auth.uid(), 'RECEIPT_VOIDED', 'RECEIPT',
    target_receipt.id, jsonb_build_object('status', 'ISSUED'),
    jsonb_build_object('status', 'VOID', 'reason', clean_reason)
  );
end;
$$;

revoke all on function public.void_receipt(uuid, text) from public, anon;
grant execute on function public.void_receipt(uuid, text) to authenticated;

create or replace function public.reissue_receipt(
  p_receipt_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_receipt public.receipts%rowtype;
  clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  new_receipt_id uuid;
  new_receipt_no text;
begin
  select * into old_receipt from public.receipts receipt
  where receipt.id = p_receipt_id for update;
  if old_receipt.id is null then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;
  if not public.has_tenant_role(
    old_receipt.tenant_id, array['OWNER']::public.clinic_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if old_receipt.status <> 'ISSUED' then
    raise exception using errcode = '22023', message = 'RECEIPT_ALREADY_VOID';
  end if;
  if clean_reason is null or char_length(clean_reason) > 500 then
    raise exception using errcode = '22023', message = 'REASON_REQUIRED';
  end if;

  update public.receipts set status = 'VOID', voided_at = now(),
    voided_by = auth.uid(), void_reason = clean_reason
  where id = old_receipt.id;
  new_receipt_no := public.next_receipt_number(old_receipt.tenant_id);
  insert into public.receipts (
    tenant_id, booking_id, room_stay_id, receipt_no, status, issued_at, issued_by,
    reissued_from_receipt_id, clinic_thai_name, clinic_english_name, clinic_phone,
    customer_name, customer_phone, pet_summary, room_summary,
    actual_checked_in_at, actual_checked_out_at, quoted_nights,
    lodging_total_satang, extra_charges_satang, total_satang, deposit_satang,
    amount_due_satang, paid_at_checkout_satang, refund_due_satang,
    payment_method, payment_status, notes
  ) select
    receipt.tenant_id, receipt.booking_id, receipt.room_stay_id, new_receipt_no,
    'ISSUED', now(), auth.uid(), receipt.id, receipt.clinic_thai_name,
    receipt.clinic_english_name, receipt.clinic_phone, receipt.customer_name,
    receipt.customer_phone, receipt.pet_summary, receipt.room_summary,
    receipt.actual_checked_in_at, receipt.actual_checked_out_at,
    receipt.quoted_nights, receipt.lodging_total_satang,
    receipt.extra_charges_satang, receipt.total_satang, receipt.deposit_satang,
    receipt.amount_due_satang, receipt.paid_at_checkout_satang,
    receipt.refund_due_satang, receipt.payment_method, receipt.payment_status,
    receipt.notes
  from public.receipts receipt where receipt.id = old_receipt.id
  returning id into new_receipt_id;

  insert into public.receipt_items (
    tenant_id, receipt_id, booking_id, line_no, item_type, item_name,
    description, pet_summary, room_summary, quantity, unit,
    unit_price_satang, amount_satang, service_date
  ) select
    item.tenant_id, new_receipt_id, item.booking_id, item.line_no,
    item.item_type, item.item_name, item.description, item.pet_summary,
    item.room_summary, item.quantity, item.unit, item.unit_price_satang,
    item.amount_satang, item.service_date
  from public.receipt_items item where item.receipt_id = old_receipt.id
  order by item.line_no;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    old_receipt.tenant_id, auth.uid(), 'RECEIPT_REISSUED', 'RECEIPT',
    new_receipt_id, jsonb_build_object('new_receipt_no', new_receipt_no,
      'voided_receipt_id', old_receipt.id, 'reason', clean_reason)
  );
  return new_receipt_id;
end;
$$;

revoke all on function public.reissue_receipt(uuid, text) from public, anon;
grant execute on function public.reissue_receipt(uuid, text) to authenticated;

create or replace function public.regenerate_receipt_artifact(p_receipt_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_receipt public.receipts%rowtype;
  next_generation integer;
begin
  select * into target_receipt from public.receipts receipt
  where receipt.id = p_receipt_id for update;
  if target_receipt.id is null then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;
  if not public.is_active_tenant_member(target_receipt.tenant_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  update public.receipts set artifact_status = 'PENDING',
    artifact_generation = artifact_generation + 1, artifact_error_code = null
  where id = target_receipt.id returning artifact_generation into next_generation;
  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    target_receipt.tenant_id, auth.uid(), 'RECEIPT_ARTIFACT_REGENERATION_REQUESTED',
    'RECEIPT', target_receipt.id,
    jsonb_build_object('artifact_generation', next_generation)
  );
  return next_generation;
end;
$$;

revoke all on function public.regenerate_receipt_artifact(uuid) from public, anon;
grant execute on function public.regenerate_receipt_artifact(uuid) to authenticated;

comment on function public.check_out_booking(
  uuid, jsonb, jsonb, boolean, text, integer, text
) is 'Atomic checkout: charge facts, settlement, closed stay, released allocation, cleaning room, booking transition, and immutable receipt snapshot.';
comment on function public.record_refund(uuid, text, text, text) is
  'OWNER-only refund workflow that matches normalized account name and final four digits against the verified incoming deposit.';
