alter table public.tenant_settings
add column promptpay_qr_enabled boolean not null default false,
add column promptpay_target_type text,
add column promptpay_target_value text,
add column promptpay_payee_name text,
add constraint tenant_settings_promptpay_target_valid check (
  (promptpay_target_type is null and promptpay_target_value is null)
  or (promptpay_target_type = 'MOBILE' and promptpay_target_value ~ '^0[0-9]{9}$')
  or (promptpay_target_type = 'NATIONAL_ID' and promptpay_target_value ~ '^[0-9]{13}$')
  or (promptpay_target_type = 'EWALLET' and promptpay_target_value ~ '^[0-9]{15}$')
),
add constraint tenant_settings_promptpay_qr_complete check (
  not promptpay_qr_enabled
  or (
    promptpay_target_type is not null
    and promptpay_target_value is not null
    and nullif(btrim(promptpay_payee_name), '') is not null
  )
),
add constraint tenant_settings_promptpay_payee_name_length check (
  promptpay_payee_name is null or char_length(promptpay_payee_name) <= 150
);

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
  p_branch_number text,
  p_promptpay_qr_enabled boolean,
  p_promptpay_target_type text,
  p_promptpay_target_value text,
  p_promptpay_payee_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_type text := nullif(btrim(coalesce(p_promptpay_target_type, '')), '');
  clean_target text := nullif(regexp_replace(
    coalesce(p_promptpay_target_value, ''), '[^0-9]', '', 'g'
  ), '');
  clean_payee text := nullif(btrim(coalesce(p_promptpay_payee_name, '')), '');
begin
  if coalesce(p_promptpay_qr_enabled, false)
    and (clean_type is null or clean_target is null or clean_payee is null)
  then
    raise exception using errcode = '22023', message = 'PROMPTPAY_CONFIGURATION_INCOMPLETE';
  end if;
  if clean_type is not null and (
    (clean_type = 'MOBILE' and clean_target !~ '^0[0-9]{9}$')
    or (clean_type = 'NATIONAL_ID' and clean_target !~ '^[0-9]{13}$')
    or (clean_type = 'EWALLET' and clean_target !~ '^[0-9]{15}$')
    or clean_type not in ('MOBILE', 'NATIONAL_ID', 'EWALLET')
  ) then
    raise exception using errcode = '22023', message = 'PROMPTPAY_TARGET_INVALID';
  end if;
  if char_length(coalesce(clean_payee, '')) > 150 then
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
    p_bank_account_number_masked,
    p_receipt_tax_enabled,
    p_receipt_tax_heading,
    p_tax_id,
    p_branch_number
  );

  update public.tenant_settings
  set promptpay_qr_enabled = coalesce(p_promptpay_qr_enabled, false),
      promptpay_target_type = clean_type,
      promptpay_target_value = clean_target,
      promptpay_payee_name = clean_payee
  where tenant_id = p_tenant_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    p_tenant_id,
    auth.uid(),
    'PROMPTPAY_QR_CONFIGURATION_UPDATED',
    'TENANT',
    p_tenant_id,
    jsonb_build_object(
      'enabled', coalesce(p_promptpay_qr_enabled, false),
      'target_type', clean_type,
      'has_target', clean_target is not null,
      'has_payee_name', clean_payee is not null
    )
  );
end;
$$;

revoke all on function public.update_tenant_configuration(
  uuid, text, text, text, text, text, text, bigint, text, text, text, text,
  boolean, text, text, text, boolean, text, text, text
) from public, anon;
grant execute on function public.update_tenant_configuration(
  uuid, text, text, text, text, text, text, bigint, text, text, text, text,
  boolean, text, text, text, boolean, text, text, text
) to authenticated;

do $$
declare
  definition text;
  old_fragment text := $fragment$
    if amount_due > 0 then
      insert into public.payments ($fragment$;
  new_fragment text := $fragment$
    if amount_due > 0 and payment_method = 'PROMPTPAY' then
      if coalesce(p_payment ->> 'receivedConfirmed', 'false') <> 'true'
        or coalesce(p_payment ->> 'quotedAmountSatang', '') !~ '^[0-9]+$'
        or (p_payment ->> 'quotedAmountSatang')::integer <> amount_due
      then
        raise exception using errcode = '22023',
          message = 'PROMPTPAY_PAYMENT_CONFIRMATION_REQUIRED';
      end if;
    end if;
    if amount_due > 0 then
      insert into public.payments ($fragment$;
begin
  select pg_get_functiondef(
    'public.check_out_booking(uuid,jsonb,jsonb,boolean,text,integer,text)'::regprocedure
  ) into definition;
  if position(old_fragment in definition) = 0 then
    raise exception 'CHECK_OUT_PROMPTPAY_PATCH_TARGET_NOT_FOUND';
  end if;
  execute replace(definition, old_fragment, new_fragment);
end;
$$;

comment on column public.tenant_settings.promptpay_target_value is
  'Exact PromptPay target used to generate server-side dynamic payment payloads. Never write this value to audit logs.';
comment on column public.tenant_settings.promptpay_qr_enabled is
  'Enables exact-amount Dynamic PromptPay QR only before final booking-group settlement.';
