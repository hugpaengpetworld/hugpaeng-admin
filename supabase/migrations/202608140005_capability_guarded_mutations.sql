-- Every application mutation remains callable by its established RPC name, but
-- the public entry point now enforces the tenant capability selected by OWNER or
-- ADMIN. The renamed implementations are deliberately not executable by API
-- roles. A local transaction setting lets their existing role guards recognise
-- an already-authorised capability without weakening unrelated RPCs.

create or replace function public.has_tenant_role(
  p_tenant_id uuid,
  p_roles public.clinic_role[]
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  member_role public.clinic_role;
  scoped_permission text := nullif(
    pg_catalog.current_setting('app.tenant_permission', true), ''
  );
begin
  select membership.role into member_role
  from public.tenant_memberships membership
  where membership.tenant_id = p_tenant_id
    and membership.user_id = auth.uid()
    and membership.status = 'ACTIVE';

  if member_role is null then return false; end if;
  if scoped_permission is not null then
    return public.has_tenant_permission(p_tenant_id, scoped_permission);
  end if;
  return member_role = any(p_roles)
    or (member_role = 'ADMIN' and 'OWNER' = any(p_roles));
end;
$$;

create or replace function public.begin_tenant_permission_scope(
  p_tenant_id uuid,
  p_permission text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  if not public.has_tenant_permission(p_tenant_id, p_permission) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  perform pg_catalog.set_config('app.tenant_permission', p_permission, true);
end;
$$;

revoke all on function public.begin_tenant_permission_scope(uuid, text)
from public, anon, authenticated;

alter function public.create_priced_back_office_booking(
  uuid, text, text, text, public.booking_channel, date, date, text, jsonb
) rename to create_priced_back_office_booking_legacy_authorized_20260814;
revoke all on function public.create_priced_back_office_booking_legacy_authorized_20260814(
  uuid, text, text, text, public.booking_channel, date, date, text, jsonb
) from public, anon, authenticated;
create function public.create_priced_back_office_booking(
  p_tenant_id uuid, p_customer_name text, p_customer_phone text,
  p_line_user_id text, p_channel public.booking_channel,
  p_check_in_date date, p_check_out_date date, p_customer_notes text,
  p_units jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.begin_tenant_permission_scope(p_tenant_id, 'BOOKINGS_WRITE');
  return public.create_priced_back_office_booking_legacy_authorized_20260814(
    p_tenant_id, p_customer_name, p_customer_phone, p_line_user_id, p_channel,
    p_check_in_date, p_check_out_date, p_customer_notes, p_units
  );
end;
$$;

alter function public.create_and_check_in_back_office_booking(
  uuid, text, text, text, public.booking_channel, date, date, text, jsonb,
  integer, text
) rename to create_and_check_in_back_office_booking_legacy_authorized_20260814;
revoke all on function public.create_and_check_in_back_office_booking_legacy_authorized_20260814(
  uuid, text, text, text, public.booking_channel, date, date, text, jsonb,
  integer, text
) from public, anon, authenticated;
create function public.create_and_check_in_back_office_booking(
  p_tenant_id uuid, p_customer_name text, p_customer_phone text,
  p_line_user_id text, p_channel public.booking_channel,
  p_check_in_date date, p_check_out_date date, p_customer_notes text,
  p_units jsonb, p_deposit_satang integer, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.begin_tenant_permission_scope(p_tenant_id, 'BOOKINGS_WRITE');
  if not public.has_tenant_permission(p_tenant_id, 'CHECK_IN') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  return public.create_and_check_in_back_office_booking_legacy_authorized_20260814(
    p_tenant_id, p_customer_name, p_customer_phone, p_line_user_id, p_channel,
    p_check_in_date, p_check_out_date, p_customer_notes, p_units,
    p_deposit_satang, p_idempotency_key
  );
end;
$$;

alter function public.review_booking(uuid, text, text, integer)
rename to review_booking_legacy_authorized_20260814;
revoke all on function public.review_booking_legacy_authorized_20260814(
  uuid, text, text, integer
) from public, anon, authenticated;
create function public.review_booking(
  p_booking_id uuid, p_decision text, p_reason text, p_expected_version integer
) returns table (
  booking_id uuid, status public.booking_status,
  payment_status public.payment_status, version integer
) language plpgsql security definer set search_path = '' as $$
declare target_tenant_id uuid;
begin
  select booking.tenant_id into target_tenant_id
  from public.bookings booking where booking.id = p_booking_id;
  perform public.begin_tenant_permission_scope(target_tenant_id, 'BOOKINGS_WRITE');
  return query select * from public.review_booking_legacy_authorized_20260814(
    p_booking_id, p_decision, p_reason, p_expected_version
  );
end;
$$;

alter function public.verify_deposit(uuid, integer)
rename to verify_deposit_legacy_authorized_20260814;
revoke all on function public.verify_deposit_legacy_authorized_20260814(
  uuid, integer
) from public, anon, authenticated;
create function public.verify_deposit(
  p_payment_id uuid, p_expected_booking_version integer
) returns void language plpgsql security definer set search_path = '' as $$
declare target_tenant_id uuid;
begin
  select payment.tenant_id into target_tenant_id
  from public.payments payment where payment.id = p_payment_id;
  perform public.begin_tenant_permission_scope(target_tenant_id, 'PAYMENTS_VERIFY');
  perform public.verify_deposit_legacy_authorized_20260814(
    p_payment_id, p_expected_booking_version
  );
end;
$$;

alter function public.decide_reschedule_request(uuid, text, text)
rename to decide_reschedule_request_legacy_authorized_20260814;
revoke all on function public.decide_reschedule_request_legacy_authorized_20260814(
  uuid, text, text
) from public, anon, authenticated;
create function public.decide_reschedule_request(
  p_request_id uuid, p_decision text, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare target_tenant_id uuid;
begin
  select request.tenant_id into target_tenant_id
  from public.reschedule_requests request where request.id = p_request_id;
  perform public.begin_tenant_permission_scope(target_tenant_id, 'BOOKINGS_WRITE');
  perform public.decide_reschedule_request_legacy_authorized_20260814(
    p_request_id, p_decision, p_reason
  );
end;
$$;

alter function public.check_in_booking(uuid, uuid, integer, text, integer, text)
rename to check_in_booking_legacy_authorized_20260814;
revoke all on function public.check_in_booking_legacy_authorized_20260814(
  uuid, uuid, integer, text, integer, text
) from public, anon, authenticated;
create function public.check_in_booking(
  p_booking_id uuid, p_room_id uuid, p_deposit_satang integer, p_notes text,
  p_expected_version integer, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare target_tenant_id uuid;
begin
  select booking.tenant_id into target_tenant_id
  from public.bookings booking where booking.id = p_booking_id;
  perform public.begin_tenant_permission_scope(target_tenant_id, 'CHECK_IN');
  return public.check_in_booking_legacy_authorized_20260814(
    p_booking_id, p_room_id, p_deposit_satang, p_notes,
    p_expected_version, p_idempotency_key
  );
end;
$$;

alter function public.check_in_room_booking(uuid, uuid, integer, text, integer, text)
rename to check_in_room_booking_legacy_authorized_20260814;
revoke all on function public.check_in_room_booking_legacy_authorized_20260814(
  uuid, uuid, integer, text, integer, text
) from public, anon, authenticated;
create function public.check_in_room_booking(
  p_booking_id uuid, p_room_id uuid, p_deposit_satang integer, p_notes text,
  p_expected_version integer, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare target_tenant_id uuid;
begin
  select booking.tenant_id into target_tenant_id
  from public.bookings booking where booking.id = p_booking_id;
  perform public.begin_tenant_permission_scope(target_tenant_id, 'CHECK_IN');
  if not public.has_tenant_permission(target_tenant_id, 'BOOKINGS_WRITE') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  return public.check_in_room_booking_legacy_authorized_20260814(
    p_booking_id, p_room_id, p_deposit_satang, p_notes,
    p_expected_version, p_idempotency_key
  );
end;
$$;

alter function public.check_out_booking(uuid, jsonb, jsonb, boolean, text, integer, text)
rename to check_out_booking_legacy_authorized_20260814;
revoke all on function public.check_out_booking_legacy_authorized_20260814(
  uuid, jsonb, jsonb, boolean, text, integer, text
) from public, anon, authenticated;
create function public.check_out_booking(
  p_booking_id uuid, p_charges jsonb, p_payment jsonb,
  p_confirm_early_checkout boolean, p_notes text,
  p_expected_version integer, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare target_tenant_id uuid;
begin
  select booking.tenant_id into target_tenant_id
  from public.bookings booking where booking.id = p_booking_id;
  perform public.begin_tenant_permission_scope(target_tenant_id, 'CHECK_OUT');
  if not public.has_tenant_permission(target_tenant_id, 'PAYMENTS_COLLECT') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  return public.check_out_booking_legacy_authorized_20260814(
    p_booking_id, p_charges, p_payment, p_confirm_early_checkout, p_notes,
    p_expected_version, p_idempotency_key
  );
end;
$$;

alter function public.create_next_room(uuid, public.animal_species)
rename to create_next_room_legacy_authorized_20260814;
revoke all on function public.create_next_room_legacy_authorized_20260814(
  uuid, public.animal_species
) from public, anon, authenticated;
create function public.create_next_room(
  p_tenant_id uuid, p_species public.animal_species
) returns table (
  room_id uuid, room_code text, species public.animal_species,
  operational_status public.room_operational_status, version integer
) language plpgsql security definer set search_path = '' as $$
begin
  perform public.begin_tenant_permission_scope(p_tenant_id, 'ROOM_INVENTORY_MANAGE');
  return query select * from public.create_next_room_legacy_authorized_20260814(
    p_tenant_id, p_species
  );
end;
$$;

alter function public.retire_room(uuid, integer, text)
rename to retire_room_legacy_authorized_20260814;
revoke all on function public.retire_room_legacy_authorized_20260814(
  uuid, integer, text
) from public, anon, authenticated;
create function public.retire_room(
  p_room_id uuid, p_expected_version integer, p_reason text
) returns table (
  room_id uuid, room_code text, species public.animal_species,
  retired_at timestamptz, version integer
) language plpgsql security definer set search_path = '' as $$
declare target_tenant_id uuid;
begin
  select room.tenant_id into target_tenant_id
  from public.room_inventory room where room.id = p_room_id;
  perform public.begin_tenant_permission_scope(target_tenant_id, 'ROOM_INVENTORY_MANAGE');
  return query select * from public.retire_room_legacy_authorized_20260814(
    p_room_id, p_expected_version, p_reason
  );
end;
$$;

alter function public.change_room_operational_state(
  uuid, public.room_operational_status, text, integer
) rename to change_room_operational_state_legacy_authorized_20260814;
revoke all on function public.change_room_operational_state_legacy_authorized_20260814(
  uuid, public.room_operational_status, text, integer
) from public, anon, authenticated;
create function public.change_room_operational_state(
  p_room_id uuid, p_new_status public.room_operational_status,
  p_reason text, p_expected_version integer
) returns table (
  room_id uuid, operational_status public.room_operational_status,
  version integer
) language plpgsql security definer set search_path = '' as $$
declare target_tenant_id uuid;
begin
  select room.tenant_id into target_tenant_id
  from public.room_inventory room where room.id = p_room_id;
  perform public.begin_tenant_permission_scope(target_tenant_id, 'ROOM_STATE_MANAGE');
  return query select * from public.change_room_operational_state_legacy_authorized_20260814(
    p_room_id, p_new_status, p_reason, p_expected_version
  );
end;
$$;

alter function public.create_sterilization_appointment(
  uuid, date, time, text, text, text, public.sterilization_species, text,
  public.sterilization_sex, text, numeric, text, text, public.booking_channel,
  text, boolean, boolean
) rename to create_sterilization_appointment_legacy_authorized_20260814;
revoke all on function public.create_sterilization_appointment_legacy_authorized_20260814(
  uuid, date, time, text, text, text, public.sterilization_species, text,
  public.sterilization_sex, text, numeric, text, text, public.booking_channel,
  text, boolean, boolean
) from public, anon, authenticated;
create function public.create_sterilization_appointment(
  p_tenant_id uuid, p_appointment_date date, p_appointment_time time,
  p_customer_name text, p_phone text, p_pet_name text,
  p_species public.sterilization_species, p_custom_species text,
  p_sex public.sterilization_sex, p_breed text, p_weight_kg numeric,
  p_age_text text, p_vaccination_status text,
  p_source_channel public.booking_channel, p_notes text,
  p_acknowledge_overbook boolean default false,
  p_holiday_override boolean default false
) returns table (appointment_id uuid, appointment_code text)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.begin_tenant_permission_scope(p_tenant_id, 'STERILIZATION_WRITE');
  if p_holiday_override and not public.has_tenant_permission(
    p_tenant_id, 'STERILIZATION_HOLIDAY_MANAGE'
  ) then
    raise exception using errcode = '42501', message = 'HOLIDAY_OVERRIDE_FORBIDDEN';
  end if;
  return query select *
  from public.create_sterilization_appointment_legacy_authorized_20260814(
    p_tenant_id, p_appointment_date, p_appointment_time, p_customer_name,
    p_phone, p_pet_name, p_species, p_custom_species, p_sex, p_breed,
    p_weight_kg, p_age_text, p_vaccination_status, p_source_channel, p_notes,
    p_acknowledge_overbook, p_holiday_override
  );
end;
$$;

alter function public.update_sterilization_status(
  uuid, public.sterilization_status
) rename to update_sterilization_status_legacy_authorized_20260814;
revoke all on function public.update_sterilization_status_legacy_authorized_20260814(
  uuid, public.sterilization_status
) from public, anon, authenticated;
create function public.update_sterilization_status(
  p_appointment_id uuid, p_status public.sterilization_status
) returns void language plpgsql security definer set search_path = '' as $$
declare target_tenant_id uuid;
begin
  select appointment.tenant_id into target_tenant_id
  from public.sterilization_appointments appointment
  where appointment.id = p_appointment_id;
  perform public.begin_tenant_permission_scope(target_tenant_id, 'STERILIZATION_WRITE');
  perform public.update_sterilization_status_legacy_authorized_20260814(
    p_appointment_id, p_status
  );
end;
$$;

alter function public.save_sterilization_holiday(uuid, date, text, boolean)
rename to save_sterilization_holiday_legacy_authorized_20260814;
revoke all on function public.save_sterilization_holiday_legacy_authorized_20260814(
  uuid, date, text, boolean
) from public, anon, authenticated;
create function public.save_sterilization_holiday(
  p_tenant_id uuid, p_holiday_date date, p_reason text,
  p_is_active boolean default true
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform public.begin_tenant_permission_scope(
    p_tenant_id, 'STERILIZATION_HOLIDAY_MANAGE'
  );
  return public.save_sterilization_holiday_legacy_authorized_20260814(
    p_tenant_id, p_holiday_date, p_reason, p_is_active
  );
end;
$$;

alter function public.record_deposit_source_account(uuid, text, text)
rename to record_deposit_source_account_legacy_authorized_20260814;
revoke all on function public.record_deposit_source_account_legacy_authorized_20260814(
  uuid, text, text
) from public, anon, authenticated;
create function public.record_deposit_source_account(
  p_payment_id uuid, p_account_name text, p_account_last4 text
) returns void language plpgsql security definer set search_path = '' as $$
declare target_tenant_id uuid;
begin
  select payment.tenant_id into target_tenant_id
  from public.payments payment where payment.id = p_payment_id;
  perform public.begin_tenant_permission_scope(target_tenant_id, 'PAYMENTS_VERIFY');
  perform public.record_deposit_source_account_legacy_authorized_20260814(
    p_payment_id, p_account_name, p_account_last4
  );
end;
$$;

alter function public.record_refund(uuid, text, text, text)
rename to record_refund_legacy_authorized_20260814;
revoke all on function public.record_refund_legacy_authorized_20260814(
  uuid, text, text, text
) from public, anon, authenticated;
create function public.record_refund(
  p_payment_id uuid, p_account_name text, p_account_number text, p_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare target_tenant_id uuid;
begin
  select payment.tenant_id into target_tenant_id
  from public.payments payment where payment.id = p_payment_id;
  perform public.begin_tenant_permission_scope(target_tenant_id, 'REFUNDS_MANAGE');
  return public.record_refund_legacy_authorized_20260814(
    p_payment_id, p_account_name, p_account_number, p_notes
  );
end;
$$;

alter function public.void_receipt(uuid, text)
rename to void_receipt_legacy_authorized_20260814;
revoke all on function public.void_receipt_legacy_authorized_20260814(
  uuid, text
) from public, anon, authenticated;
create function public.void_receipt(p_receipt_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare target_tenant_id uuid;
begin
  select receipt.tenant_id into target_tenant_id
  from public.receipts receipt where receipt.id = p_receipt_id;
  perform public.begin_tenant_permission_scope(target_tenant_id, 'RECEIPTS_MANAGE');
  perform public.void_receipt_legacy_authorized_20260814(p_receipt_id, p_reason);
end;
$$;

alter function public.reissue_receipt(uuid, text)
rename to reissue_receipt_legacy_authorized_20260814;
revoke all on function public.reissue_receipt_legacy_authorized_20260814(
  uuid, text
) from public, anon, authenticated;
create function public.reissue_receipt(p_receipt_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target_tenant_id uuid;
begin
  select receipt.tenant_id into target_tenant_id
  from public.receipts receipt where receipt.id = p_receipt_id;
  perform public.begin_tenant_permission_scope(target_tenant_id, 'RECEIPTS_MANAGE');
  return public.reissue_receipt_legacy_authorized_20260814(p_receipt_id, p_reason);
end;
$$;

alter function public.regenerate_receipt_artifact(uuid)
rename to regenerate_receipt_artifact_legacy_authorized_20260814;
revoke all on function public.regenerate_receipt_artifact_legacy_authorized_20260814(uuid)
from public, anon, authenticated;
create function public.regenerate_receipt_artifact(p_receipt_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare target_tenant_id uuid;
begin
  select receipt.tenant_id into target_tenant_id
  from public.receipts receipt where receipt.id = p_receipt_id;
  perform public.begin_tenant_permission_scope(target_tenant_id, 'RECEIPTS_MANAGE');
  return public.regenerate_receipt_artifact_legacy_authorized_20260814(p_receipt_id);
end;
$$;

alter function public.update_tenant_configuration(
  uuid, text, text, text, text, text, text, bigint, text, text, text, text,
  boolean, text, text, text, boolean, text, text, text
) rename to update_tenant_configuration_legacy_authorized_20260814;
revoke all on function public.update_tenant_configuration_legacy_authorized_20260814(
  uuid, text, text, text, text, text, text, bigint, text, text, text, text,
  boolean, text, text, text, boolean, text, text, text
) from public, anon, authenticated;
create function public.update_tenant_configuration(
  p_tenant_id uuid, p_thai_name text, p_english_name text,
  p_clinic_address text, p_contact_phone text, p_logo_storage_path text,
  p_logo_mime_type text, p_logo_size_bytes bigint,
  p_promptpay_display_value text, p_bank_name text,
  p_bank_account_name text, p_bank_account_number_masked text,
  p_receipt_tax_enabled boolean, p_receipt_tax_heading text,
  p_tax_id text, p_branch_number text, p_promptpay_qr_enabled boolean,
  p_promptpay_target_type text, p_promptpay_target_value text,
  p_promptpay_payee_name text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.begin_tenant_permission_scope(p_tenant_id, 'SETTINGS_MANAGE');
  perform public.update_tenant_configuration_legacy_authorized_20260814(
    p_tenant_id, p_thai_name, p_english_name, p_clinic_address,
    p_contact_phone, p_logo_storage_path, p_logo_mime_type, p_logo_size_bytes,
    p_promptpay_display_value, p_bank_name, p_bank_account_name,
    p_bank_account_number_masked, p_receipt_tax_enabled,
    p_receipt_tax_heading, p_tax_id, p_branch_number, p_promptpay_qr_enabled,
    p_promptpay_target_type, p_promptpay_target_value, p_promptpay_payee_name
  );
end;
$$;

alter function public.create_back_office_booking(
  uuid, text, text, text, public.booking_channel, date, date, text, jsonb
) rename to create_back_office_booking_legacy_authorized_20260814;
revoke all on function public.create_back_office_booking_legacy_authorized_20260814(
  uuid, text, text, text, public.booking_channel, date, date, text, jsonb
) from public, anon, authenticated;
create function public.create_back_office_booking(
  p_tenant_id uuid, p_customer_name text, p_customer_phone text,
  p_line_user_id text, p_channel public.booking_channel,
  p_check_in_date date, p_check_out_date date, p_customer_notes text,
  p_units jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.begin_tenant_permission_scope(p_tenant_id, 'BOOKINGS_WRITE');
  return public.create_back_office_booking_legacy_authorized_20260814(
    p_tenant_id, p_customer_name, p_customer_phone, p_line_user_id, p_channel,
    p_check_in_date, p_check_out_date, p_customer_notes, p_units
  );
end;
$$;

alter function public.allocate_planned_room(uuid, uuid, public.allocation_status)
rename to allocate_planned_room_legacy_authorized_20260814;
revoke all on function public.allocate_planned_room_legacy_authorized_20260814(
  uuid, uuid, public.allocation_status
) from public, anon, authenticated;
create function public.allocate_planned_room(
  p_booking_id uuid, p_room_id uuid,
  p_allocation_status public.allocation_status default 'HOLD'
) returns table (allocation_id uuid, booking_code text)
language plpgsql security definer set search_path = '' as $$
declare target_tenant_id uuid;
begin
  select booking.tenant_id into target_tenant_id
  from public.bookings booking where booking.id = p_booking_id;
  perform public.begin_tenant_permission_scope(target_tenant_id, 'BOOKINGS_WRITE');
  return query select *
  from public.allocate_planned_room_legacy_authorized_20260814(
    p_booking_id, p_room_id, p_allocation_status
  );
end;
$$;

alter function public.get_room_plan(uuid, public.animal_species, date)
rename to get_room_plan_legacy_authorized_20260814;
revoke all on function public.get_room_plan_legacy_authorized_20260814(
  uuid, public.animal_species, date
) from public, anon, authenticated;
create function public.get_room_plan(
  p_tenant_id uuid, p_species public.animal_species, p_plan_date date
) returns table (
  room_id uuid, room_code text, species public.animal_species,
  operational_status public.room_operational_status, version integer,
  display_status text, booking_id uuid, booking_code text, pet_names text[],
  planned_check_in date, planned_check_out date, checked_in_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_tenant_permission(p_tenant_id, 'BOOKINGS_READ') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  return query select * from public.get_room_plan_legacy_authorized_20260814(
    p_tenant_id, p_species, p_plan_date
  );
end;
$$;

alter function public.get_eligible_rooms(
  uuid, public.animal_species, date, date, uuid
) rename to get_eligible_rooms_legacy_authorized_20260814;
revoke all on function public.get_eligible_rooms_legacy_authorized_20260814(
  uuid, public.animal_species, date, date, uuid
) from public, anon, authenticated;
create function public.get_eligible_rooms(
  p_tenant_id uuid, p_species public.animal_species,
  p_check_in_date date, p_check_out_date date,
  p_exclude_booking_id uuid default null
) returns table (room_id uuid, room_code text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_tenant_permission(p_tenant_id, 'BOOKINGS_WRITE') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  return query select * from public.get_eligible_rooms_legacy_authorized_20260814(
    p_tenant_id, p_species, p_check_in_date, p_check_out_date,
    p_exclude_booking_id
  );
end;
$$;

alter function public.preview_checkout(uuid)
rename to preview_checkout_legacy_authorized_20260814;
revoke all on function public.preview_checkout_legacy_authorized_20260814(uuid)
from public, anon, authenticated;
create function public.preview_checkout(p_booking_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare target_tenant_id uuid;
begin
  select booking.tenant_id into target_tenant_id
  from public.bookings booking where booking.id = p_booking_id;
  if not public.has_tenant_permission(target_tenant_id, 'CHECK_OUT')
     or not public.has_tenant_permission(target_tenant_id, 'PAYMENTS_COLLECT') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  return public.preview_checkout_legacy_authorized_20260814(p_booking_id);
end;
$$;

revoke all on function public.create_priced_back_office_booking(
  uuid, text, text, text, public.booking_channel, date, date, text, jsonb
) from public, anon;
revoke all on function public.create_and_check_in_back_office_booking(
  uuid, text, text, text, public.booking_channel, date, date, text, jsonb,
  integer, text
) from public, anon;
revoke all on function public.review_booking(uuid, text, text, integer) from public, anon;
revoke all on function public.verify_deposit(uuid, integer) from public, anon;
revoke all on function public.decide_reschedule_request(uuid, text, text) from public, anon;
revoke all on function public.check_in_booking(uuid, uuid, integer, text, integer, text) from public, anon;
revoke all on function public.check_in_room_booking(uuid, uuid, integer, text, integer, text) from public, anon;
revoke all on function public.check_out_booking(uuid, jsonb, jsonb, boolean, text, integer, text) from public, anon;
revoke all on function public.create_next_room(uuid, public.animal_species) from public, anon;
revoke all on function public.retire_room(uuid, integer, text) from public, anon;
revoke all on function public.change_room_operational_state(uuid, public.room_operational_status, text, integer) from public, anon;
revoke all on function public.create_sterilization_appointment(
  uuid, date, time, text, text, text, public.sterilization_species, text,
  public.sterilization_sex, text, numeric, text, text, public.booking_channel,
  text, boolean, boolean
) from public, anon;
revoke all on function public.update_sterilization_status(uuid, public.sterilization_status) from public, anon;
revoke all on function public.save_sterilization_holiday(uuid, date, text, boolean) from public, anon;
revoke all on function public.record_deposit_source_account(uuid, text, text) from public, anon;
revoke all on function public.record_refund(uuid, text, text, text) from public, anon;
revoke all on function public.void_receipt(uuid, text) from public, anon;
revoke all on function public.reissue_receipt(uuid, text) from public, anon;
revoke all on function public.regenerate_receipt_artifact(uuid) from public, anon;
revoke all on function public.update_tenant_configuration(
  uuid, text, text, text, text, text, text, bigint, text, text, text, text,
  boolean, text, text, text, boolean, text, text, text
) from public, anon;
revoke all on function public.create_back_office_booking(
  uuid, text, text, text, public.booking_channel, date, date, text, jsonb
) from public, anon;
revoke all on function public.allocate_planned_room(
  uuid, uuid, public.allocation_status
) from public, anon;
revoke all on function public.get_room_plan(
  uuid, public.animal_species, date
) from public, anon;
revoke all on function public.get_eligible_rooms(
  uuid, public.animal_species, date, date, uuid
) from public, anon;
revoke all on function public.preview_checkout(uuid) from public, anon;

grant execute on function public.create_priced_back_office_booking(
  uuid, text, text, text, public.booking_channel, date, date, text, jsonb
) to authenticated;
grant execute on function public.create_and_check_in_back_office_booking(
  uuid, text, text, text, public.booking_channel, date, date, text, jsonb,
  integer, text
) to authenticated;
grant execute on function public.review_booking(uuid, text, text, integer) to authenticated;
grant execute on function public.verify_deposit(uuid, integer) to authenticated;
grant execute on function public.decide_reschedule_request(uuid, text, text) to authenticated;
grant execute on function public.check_in_booking(uuid, uuid, integer, text, integer, text) to authenticated;
grant execute on function public.check_in_room_booking(uuid, uuid, integer, text, integer, text) to authenticated;
grant execute on function public.check_out_booking(uuid, jsonb, jsonb, boolean, text, integer, text) to authenticated;
grant execute on function public.create_next_room(uuid, public.animal_species) to authenticated;
grant execute on function public.retire_room(uuid, integer, text) to authenticated;
grant execute on function public.change_room_operational_state(uuid, public.room_operational_status, text, integer) to authenticated;
grant execute on function public.create_sterilization_appointment(
  uuid, date, time, text, text, text, public.sterilization_species, text,
  public.sterilization_sex, text, numeric, text, text, public.booking_channel,
  text, boolean, boolean
) to authenticated;
grant execute on function public.update_sterilization_status(uuid, public.sterilization_status) to authenticated;
grant execute on function public.save_sterilization_holiday(uuid, date, text, boolean) to authenticated;
grant execute on function public.record_deposit_source_account(uuid, text, text) to authenticated;
grant execute on function public.record_refund(uuid, text, text, text) to authenticated;
grant execute on function public.void_receipt(uuid, text) to authenticated;
grant execute on function public.reissue_receipt(uuid, text) to authenticated;
grant execute on function public.regenerate_receipt_artifact(uuid) to authenticated;
grant execute on function public.update_tenant_configuration(
  uuid, text, text, text, text, text, text, bigint, text, text, text, text,
  boolean, text, text, text, boolean, text, text, text
) to authenticated;
grant execute on function public.create_back_office_booking(
  uuid, text, text, text, public.booking_channel, date, date, text, jsonb
) to authenticated;
grant execute on function public.allocate_planned_room(
  uuid, uuid, public.allocation_status
) to authenticated;
grant execute on function public.get_room_plan(
  uuid, public.animal_species, date
) to authenticated;
grant execute on function public.get_eligible_rooms(
  uuid, public.animal_species, date, date, uuid
) to authenticated;
grant execute on function public.preview_checkout(uuid) to authenticated;

-- Table and Storage reads must honor the same per-user capabilities as RPCs.
-- Existing temporary-support policies remain additive and independently scoped.
drop policy if exists memberships_select_self_or_owner on public.tenant_memberships;
create policy memberships_select_self_or_manager on public.tenant_memberships
for select to authenticated using (
  user_id = auth.uid()
  or public.has_tenant_role(tenant_id, array['OWNER']::public.clinic_role[])
);

drop policy if exists booking_groups_select_member on public.booking_groups;
create policy booking_groups_select_permission on public.booking_groups
for select to authenticated using (
  public.has_tenant_permission(tenant_id, 'BOOKINGS_READ')
);

drop policy if exists bookings_select_member on public.bookings;
create policy bookings_select_permission on public.bookings
for select to authenticated using (
  public.has_tenant_permission(tenant_id, 'BOOKINGS_READ')
);

drop policy if exists booking_pets_select_member on public.booking_pets;
create policy booking_pets_select_permission on public.booking_pets
for select to authenticated using (
  public.has_tenant_permission(tenant_id, 'BOOKINGS_READ')
);

drop policy if exists rooms_select_member on public.room_inventory;
create policy rooms_select_permission on public.room_inventory
for select to authenticated using (
  public.has_tenant_permission(tenant_id, 'BOOKINGS_READ')
);

drop policy if exists allocations_select_member on public.room_allocations;
create policy allocations_select_permission on public.room_allocations
for select to authenticated using (
  public.has_tenant_permission(tenant_id, 'BOOKINGS_READ')
);

drop policy if exists stays_select_member on public.room_stays;
create policy stays_select_permission on public.room_stays
for select to authenticated using (
  public.has_tenant_permission(tenant_id, 'BOOKINGS_READ')
);

drop policy if exists reschedule_requests_select_member on public.reschedule_requests;
create policy reschedule_requests_select_permission on public.reschedule_requests
for select to authenticated using (
  public.has_tenant_permission(tenant_id, 'BOOKINGS_READ')
);

drop policy if exists sterilization_appointments_select_member
on public.sterilization_appointments;
create policy sterilization_appointments_select_permission
on public.sterilization_appointments for select to authenticated using (
  public.has_tenant_permission(tenant_id, 'STERILIZATION_READ')
);

drop policy if exists sterilization_holidays_select_member
on public.sterilization_holidays;
create policy sterilization_holidays_select_permission
on public.sterilization_holidays for select to authenticated using (
  public.has_tenant_permission(tenant_id, 'STERILIZATION_READ')
);

drop policy if exists payments_select_member on public.payments;
create policy payments_select_permission on public.payments
for select to authenticated using (
  public.has_tenant_permission(tenant_id, 'PAYMENTS_COLLECT')
  or public.has_tenant_permission(tenant_id, 'PAYMENTS_VERIFY')
  or public.has_tenant_permission(tenant_id, 'REFUNDS_MANAGE')
  or public.has_tenant_permission(tenant_id, 'RECEIPTS_MANAGE')
);

drop policy if exists booking_charges_select_member on public.booking_charges;
create policy booking_charges_select_permission on public.booking_charges
for select to authenticated using (
  public.has_tenant_permission(tenant_id, 'BOOKINGS_READ')
  or public.has_tenant_permission(tenant_id, 'PAYMENTS_COLLECT')
);

drop policy if exists receipts_select_member on public.receipts;
create policy receipts_select_permission on public.receipts
for select to authenticated using (
  public.has_tenant_permission(tenant_id, 'PAYMENTS_COLLECT')
  or public.has_tenant_permission(tenant_id, 'RECEIPTS_MANAGE')
);

drop policy if exists receipt_items_select_member on public.receipt_items;
create policy receipt_items_select_permission on public.receipt_items
for select to authenticated using (
  public.has_tenant_permission(tenant_id, 'PAYMENTS_COLLECT')
  or public.has_tenant_permission(tenant_id, 'RECEIPTS_MANAGE')
);

drop policy if exists audit_logs_select_owner on public.audit_logs;
create policy audit_logs_select_permission on public.audit_logs
for select to authenticated using (
  public.has_tenant_permission(tenant_id, 'AUDIT_READ')
);

drop policy if exists pet_health_profiles_select_clinical
on public.pet_health_profiles;
drop policy if exists pet_health_profiles_mutate_clinical
on public.pet_health_profiles;
create policy pet_health_profiles_select_permission
on public.pet_health_profiles for select to authenticated using (
  public.has_tenant_permission(tenant_id, 'HEALTH_READ')
);
create policy pet_health_profiles_mutate_permission
on public.pet_health_profiles for all to authenticated using (
  public.has_tenant_permission(tenant_id, 'HEALTH_WRITE')
) with check (
  public.has_tenant_permission(tenant_id, 'HEALTH_WRITE')
);

drop policy if exists file_assets_select_authorized on public.file_assets;
drop policy if exists file_assets_insert_by_purpose on public.file_assets;
create policy file_assets_select_permission on public.file_assets
for select to authenticated using (
  case purpose
    when 'BRANDING' then public.is_active_tenant_member(tenant_id)
    when 'VACCINATION' then public.has_tenant_permission(tenant_id, 'HEALTH_READ')
      or public.has_tenant_permission(tenant_id, 'BOOKINGS_READ')
    when 'PAYMENT_EVIDENCE' then public.has_tenant_permission(tenant_id, 'PAYMENTS_VERIFY')
    else false
  end
);
create policy file_assets_insert_permission on public.file_assets
for insert to authenticated with check (
  uploaded_by = auth.uid()
  and case purpose
    when 'BRANDING' then public.has_tenant_permission(tenant_id, 'SETTINGS_MANAGE')
    when 'VACCINATION' then public.has_tenant_permission(tenant_id, 'HEALTH_WRITE')
      or public.has_tenant_permission(tenant_id, 'BOOKINGS_WRITE')
    when 'PAYMENT_EVIDENCE' then public.has_tenant_permission(tenant_id, 'PAYMENTS_VERIFY')
    else false
  end
);

drop policy if exists tenant_assets_select_member on storage.objects;
drop policy if exists tenant_assets_insert_by_purpose on storage.objects;
drop policy if exists tenant_assets_delete_owner on storage.objects;
create policy tenant_assets_select_permission on storage.objects
for select to authenticated using (
  bucket_id = 'tenant-assets'
  and (storage.foldername(name))[1] ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and case (storage.foldername(name))[2]
    when 'branding' then public.is_active_tenant_member(
      ((storage.foldername(name))[1])::uuid
    )
    when 'vaccination' then public.has_tenant_permission(
      ((storage.foldername(name))[1])::uuid, 'HEALTH_READ'
    ) or public.has_tenant_permission(
      ((storage.foldername(name))[1])::uuid, 'BOOKINGS_READ'
    )
    when 'payment-evidence' then public.has_tenant_permission(
      ((storage.foldername(name))[1])::uuid, 'PAYMENTS_VERIFY'
    )
    else false
  end
);
create policy tenant_assets_insert_permission on storage.objects
for insert to authenticated with check (
  bucket_id = 'tenant-assets'
  and (storage.foldername(name))[1] ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and case (storage.foldername(name))[2]
    when 'branding' then public.has_tenant_permission(
      ((storage.foldername(name))[1])::uuid, 'SETTINGS_MANAGE'
    )
    when 'vaccination' then public.has_tenant_permission(
      ((storage.foldername(name))[1])::uuid, 'HEALTH_WRITE'
    ) or public.has_tenant_permission(
      ((storage.foldername(name))[1])::uuid, 'BOOKINGS_WRITE'
    )
    when 'payment-evidence' then public.has_tenant_permission(
      ((storage.foldername(name))[1])::uuid, 'PAYMENTS_VERIFY'
    )
    else false
  end
);
create policy tenant_assets_delete_permission on storage.objects
for delete to authenticated using (
  bucket_id = 'tenant-assets'
  and (storage.foldername(name))[1] ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.has_tenant_permission(
    ((storage.foldername(name))[1])::uuid, 'SETTINGS_MANAGE'
  )
);
