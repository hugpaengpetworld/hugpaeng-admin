alter table public.tenant_settings
add column clinic_address text,
add constraint tenant_settings_clinic_address_length
  check (clinic_address is null or char_length(clinic_address) <= 500);

alter table public.receipts
add column clinic_address text;

update public.receipts receipt
set clinic_address = settings.clinic_address
from public.tenant_settings settings
where settings.tenant_id = receipt.tenant_id
  and receipt.clinic_address is null;

create or replace function public.set_receipt_clinic_address()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.clinic_address is null and new.reissued_from_receipt_id is not null then
    select receipt.clinic_address into new.clinic_address
    from public.receipts receipt
    where receipt.tenant_id = new.tenant_id
      and receipt.id = new.reissued_from_receipt_id;
  end if;

  if new.clinic_address is null then
    select settings.clinic_address into new.clinic_address
    from public.tenant_settings settings
    where settings.tenant_id = new.tenant_id;
  end if;

  return new;
end;
$$;

create trigger receipts_set_clinic_address
before insert on public.receipts
for each row execute function public.set_receipt_clinic_address();

revoke execute on function public.update_tenant_configuration(
  uuid, text, text, text, text, text, bigint, text, text, text, text
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
  p_bank_account_number_masked text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_address text := nullif(btrim(coalesce(p_clinic_address, '')), '');
begin
  if coalesce(char_length(clean_address), 0) > 500 then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  perform public.update_tenant_configuration(
    p_tenant_id,
    p_thai_name,
    p_english_name,
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
  set clinic_address = clean_address
  where tenant_id = p_tenant_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    p_tenant_id,
    auth.uid(),
    'RECEIPT_CONTACT_IDENTITY_UPDATED',
    'TENANT',
    p_tenant_id,
    jsonb_build_object(
      'has_address', clean_address is not null,
      'has_phone', nullif(btrim(coalesce(p_contact_phone, '')), '') is not null,
      'tax_fields_enabled', false
    )
  );
end;
$$;

revoke all on function public.update_tenant_configuration(
  uuid, text, text, text, text, text, text, bigint, text, text, text, text
) from public, anon;
grant execute on function public.update_tenant_configuration(
  uuid, text, text, text, text, text, text, bigint, text, text, text, text
) to authenticated;

comment on column public.tenant_settings.clinic_address is
  'Clinic address displayed on receipt headers. Tax identity and branch fields are intentionally out of scope.';
comment on column public.receipts.clinic_address is
  'Immutable clinic-address snapshot. Receipt headers display this address and clinic_phone only; no tax identity fields.';
