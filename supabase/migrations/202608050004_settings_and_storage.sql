create table public.tenant_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  contact_phone text,
  logo_storage_path text,
  promptpay_display_value text,
  bank_name text,
  bank_account_name text,
  bank_account_number_masked text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_settings_phone_format check (
    contact_phone is null or contact_phone ~ '^\+?[0-9]{8,15}$'
  ),
  constraint tenant_settings_logo_tenant_path check (
    logo_storage_path is null or split_part(logo_storage_path, '/', 1) = tenant_id::text
  )
);

create table public.file_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  storage_bucket text not null default 'tenant-assets' check (storage_bucket = 'tenant-assets'),
  storage_path text not null,
  purpose text not null check (purpose in ('BRANDING', 'VACCINATION', 'PAYMENT_EVIDENCE')),
  entity_type text not null,
  entity_id uuid not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid references public.profiles(user_id) on delete set null,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, storage_path),
  unique (tenant_id, id),
  constraint file_assets_tenant_path check (split_part(storage_path, '/', 1) = tenant_id::text),
  constraint file_assets_mime_allowlist check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  )
);

create index file_assets_tenant_entity_idx
  on public.file_assets (tenant_id, entity_type, entity_id);

create table public.pet_health_profiles (
  pet_id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vaccination_asset_id uuid,
  flea_tick_treated boolean,
  flea_tick_product text,
  flea_tick_treated_on date,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, pet_id),
  foreign key (tenant_id, pet_id) references public.pets(tenant_id, id) on delete cascade,
  foreign key (tenant_id, vaccination_asset_id)
    references public.file_assets(tenant_id, id) on delete restrict
);

create trigger tenant_settings_set_updated_at
before update on public.tenant_settings
for each row execute function public.set_updated_at();

create trigger pet_health_profiles_set_updated_at
before update on public.pet_health_profiles
for each row execute function public.set_updated_at();

alter table public.tenant_settings enable row level security;
alter table public.file_assets enable row level security;
alter table public.pet_health_profiles enable row level security;

create policy tenant_settings_select_member on public.tenant_settings
for select to authenticated
using (public.is_active_tenant_member(tenant_id));

create policy tenant_settings_mutate_owner on public.tenant_settings
for all to authenticated
using (public.has_tenant_role(tenant_id, array['OWNER']::public.clinic_role[]))
with check (public.has_tenant_role(tenant_id, array['OWNER']::public.clinic_role[]));

create policy file_assets_select_authorized on public.file_assets
for select to authenticated
using (
  public.has_tenant_role(tenant_id, array['OWNER']::public.clinic_role[])
  or (
    purpose in ('BRANDING', 'VACCINATION')
    and public.has_tenant_role(tenant_id, array['DOCTOR']::public.clinic_role[])
  )
  or (
    purpose in ('BRANDING', 'PAYMENT_EVIDENCE')
    and public.has_tenant_role(tenant_id, array['STAFF']::public.clinic_role[])
  )
);

create policy file_assets_insert_member on public.file_assets
for insert to authenticated
with check (public.is_active_tenant_member(tenant_id) and uploaded_by = auth.uid());

create policy pet_health_profiles_select_clinical on public.pet_health_profiles
for select to authenticated
using (public.has_tenant_role(
  tenant_id,
  array['OWNER', 'DOCTOR']::public.clinic_role[]
));

create policy pet_health_profiles_mutate_clinical on public.pet_health_profiles
for all to authenticated
using (public.has_tenant_role(
  tenant_id,
  array['OWNER', 'DOCTOR']::public.clinic_role[]
))
with check (public.has_tenant_role(
  tenant_id,
  array['OWNER', 'DOCTOR']::public.clinic_role[]
));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tenant-assets',
  'tenant-assets',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy tenant_assets_select_member on storage.objects
for select to authenticated
using (
  bucket_id = 'tenant-assets'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (
        public.has_tenant_role(
          ((storage.foldername(name))[1])::uuid,
          array['OWNER']::public.clinic_role[]
        )
        or (
          (storage.foldername(name))[2] in ('branding', 'vaccination')
          and public.has_tenant_role(
            ((storage.foldername(name))[1])::uuid,
            array['DOCTOR']::public.clinic_role[]
          )
        )
        or (
          (storage.foldername(name))[2] in ('branding', 'payment-evidence')
          and public.has_tenant_role(
            ((storage.foldername(name))[1])::uuid,
            array['STAFF']::public.clinic_role[]
          )
        )
      )
    else false
  end
);

create policy tenant_assets_insert_member on storage.objects
for insert to authenticated
with check (
  bucket_id = 'tenant-assets'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_active_tenant_member(((storage.foldername(name))[1])::uuid)
    else false
  end
);

create policy tenant_assets_delete_owner on storage.objects
for delete to authenticated
using (
  bucket_id = 'tenant-assets'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.has_tenant_role(
        ((storage.foldername(name))[1])::uuid,
        array['OWNER']::public.clinic_role[]
      )
    else false
  end
);

comment on table public.file_assets is
  'Metadata only. Object paths are randomized and tenant-prefixed; bucket access remains private.';
comment on table public.pet_health_profiles is
  'Health facts are separated from operational pet identity so STAFF access is deny-by-default.';
