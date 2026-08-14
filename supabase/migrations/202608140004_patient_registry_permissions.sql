set search_path = public, extensions;

create table public.permission_catalog (
  code text primary key check (code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  thai_label text not null check (char_length(thai_label) between 1 and 120),
  description text not null check (char_length(description) between 1 and 500),
  sort_order smallint not null unique check (sort_order > 0)
);

create table public.tenant_role_permission_defaults (
  role public.clinic_role not null,
  permission_code text not null references public.permission_catalog(code) on delete cascade,
  is_allowed boolean not null default true,
  primary key (role, permission_code)
);

create table public.tenant_membership_permission_overrides (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  membership_id uuid not null,
  permission_code text not null references public.permission_catalog(code) on delete cascade,
  is_allowed boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (membership_id, permission_code),
  foreign key (tenant_id, membership_id)
    references public.tenant_memberships(tenant_id, id) on delete cascade
);

create index membership_permission_overrides_tenant_idx
  on public.tenant_membership_permission_overrides (tenant_id, membership_id);

insert into public.permission_catalog (code, thai_label, description, sort_order) values
  ('CUSTOMERS_READ', 'ดูทะเบียนลูกค้า', 'ค้นหาและดูข้อมูลติดต่อของลูกค้าภายในคลินิก', 10),
  ('CUSTOMERS_WRITE', 'จัดการทะเบียนลูกค้า', 'สร้างและแก้ไขข้อมูลลูกค้าภายในคลินิก', 20),
  ('PETS_READ', 'ดูทะเบียนสัตว์เลี้ยง', 'ค้นหาและดูข้อมูลสัตว์เลี้ยงและ HN', 30),
  ('PETS_WRITE', 'จัดการทะเบียนสัตว์เลี้ยง', 'สร้างและแก้ไขข้อมูลสัตว์เลี้ยง', 40),
  ('BOOKINGS_READ', 'ดูรายการจอง', 'ดูรายการจองฝากเลี้ยงและข้อมูลห้องพัก', 50),
  ('BOOKINGS_WRITE', 'จัดการรายการจอง', 'สร้าง อนุมัติ และเปลี่ยนสถานะรายการจอง', 60),
  ('CHECK_IN', 'เช็กอิน', 'เช็กอินสัตว์เข้าห้องพัก', 70),
  ('CHECK_OUT', 'เช็กเอาต์', 'ตรวจยอดและเช็กเอาต์สัตว์จากห้องพัก', 80),
  ('ROOM_STATE_MANAGE', 'จัดการสถานะห้อง', 'เปลี่ยนสถานะพร้อมใช้ ทำความสะอาด หรือซ่อมบำรุง', 90),
  ('ROOM_INVENTORY_MANAGE', 'เพิ่มหรือลดห้อง', 'เพิ่มห้องและเลิกใช้งานห้องโดยรักษาประวัติ', 100),
  ('STERILIZATION_READ', 'ดูคิวทำหมัน', 'ดูปฏิทินและรายการนัดทำหมัน', 110),
  ('STERILIZATION_WRITE', 'จัดการคิวทำหมัน', 'สร้างและเปลี่ยนสถานะนัดทำหมัน', 120),
  ('STERILIZATION_HOLIDAY_MANAGE', 'จัดการวันหยุดทำหมัน', 'ตั้งวันหยุดและยืนยันข้อยกเว้นของคิวทำหมัน', 130),
  ('HEALTH_READ', 'ดูข้อมูลสุขภาพ', 'ดูข้อมูลสุขภาพที่แยกจากข้อมูลปฏิบัติการ', 140),
  ('HEALTH_WRITE', 'บันทึกข้อมูลสุขภาพ', 'สร้างและแก้ไขข้อมูลสุขภาพตามขอบเขตที่ได้รับอนุญาต', 150),
  ('PAYMENTS_COLLECT', 'รับชำระเงิน', 'บันทึกการรับชำระเงินจากลูกค้า', 160),
  ('PAYMENTS_VERIFY', 'ตรวจสอบการชำระเงิน', 'ยืนยันหลักฐานหรือยอดรับชำระ', 170),
  ('REFUNDS_MANAGE', 'จัดการคืนเงิน', 'บันทึกและอนุมัติการคืนเงิน', 180),
  ('RECEIPTS_MANAGE', 'จัดการใบเสร็จ', 'ออก ยกเลิก และออกใบเสร็จทดแทนตามสิทธิ์', 190),
  ('SETTINGS_MANAGE', 'ตั้งค่าคลินิก', 'แก้ไขข้อมูลคลินิก โลโก้ พร้อมเพย์ และค่าระบบ', 200),
  ('USERS_MANAGE', 'จัดการผู้ใช้งาน', 'เชิญและจัดการผู้ใช้งานภายใต้ข้อจำกัดบทบาท', 210),
  ('AUDIT_READ', 'ดูประวัติการตรวจสอบ', 'ดู audit log ของคลินิก', 220);

insert into public.tenant_role_permission_defaults (role, permission_code)
select 'DOCTOR'::public.clinic_role, code
from public.permission_catalog
where code in (
  'CUSTOMERS_READ', 'CUSTOMERS_WRITE', 'PETS_READ', 'PETS_WRITE',
  'BOOKINGS_READ', 'BOOKINGS_WRITE', 'CHECK_IN', 'CHECK_OUT',
  'ROOM_STATE_MANAGE', 'STERILIZATION_READ', 'STERILIZATION_WRITE',
  'STERILIZATION_HOLIDAY_MANAGE', 'HEALTH_READ', 'HEALTH_WRITE'
);

insert into public.tenant_role_permission_defaults (role, permission_code)
select 'STAFF'::public.clinic_role, code
from public.permission_catalog
where code in (
  'CUSTOMERS_READ', 'CUSTOMERS_WRITE', 'PETS_READ', 'PETS_WRITE',
  'BOOKINGS_READ', 'BOOKINGS_WRITE', 'CHECK_IN', 'CHECK_OUT',
  'ROOM_STATE_MANAGE', 'STERILIZATION_READ', 'STERILIZATION_WRITE',
  'PAYMENTS_COLLECT', 'PAYMENTS_VERIFY', 'RECEIPTS_MANAGE'
);

insert into public.tenant_role_permission_defaults (role, permission_code)
select 'COUNTER'::public.clinic_role, code
from public.permission_catalog
where code in (
  'CUSTOMERS_READ', 'CUSTOMERS_WRITE', 'PETS_READ', 'PETS_WRITE',
  'BOOKINGS_READ', 'BOOKINGS_WRITE', 'CHECK_IN', 'CHECK_OUT',
  'STERILIZATION_READ', 'STERILIZATION_WRITE', 'PAYMENTS_COLLECT',
  'PAYMENTS_VERIFY', 'RECEIPTS_MANAGE'
);

insert into public.tenant_role_permission_defaults (role, permission_code)
select 'ASSISTANT'::public.clinic_role, code
from public.permission_catalog
where code in (
  'CUSTOMERS_READ', 'CUSTOMERS_WRITE', 'PETS_READ', 'PETS_WRITE',
  'BOOKINGS_READ', 'CHECK_IN', 'ROOM_STATE_MANAGE',
  'STERILIZATION_READ', 'STERILIZATION_WRITE', 'HEALTH_READ', 'HEALTH_WRITE'
);

create or replace function public.has_tenant_role(
  p_tenant_id uuid,
  p_roles public.clinic_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_memberships membership
    where membership.tenant_id = p_tenant_id
      and membership.user_id = auth.uid()
      and membership.status = 'ACTIVE'
      and (
        membership.role = any(p_roles)
        or (membership.role = 'ADMIN' and 'OWNER' = any(p_roles))
      )
  );
$$;

create or replace function public.has_tenant_permission(
  p_tenant_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when membership.role in ('OWNER', 'ADMIN') then true
      else coalesce(
        override.is_allowed,
        role_default.is_allowed,
        false
      )
    end
    from public.tenant_memberships membership
    left join public.tenant_membership_permission_overrides override
      on override.tenant_id = membership.tenant_id
     and override.membership_id = membership.id
     and override.permission_code = p_permission_code
    left join public.tenant_role_permission_defaults role_default
      on role_default.role = membership.role
     and role_default.permission_code = p_permission_code
    where membership.tenant_id = p_tenant_id
      and membership.user_id = auth.uid()
      and membership.status = 'ACTIVE'
      and exists (
        select 1 from public.permission_catalog catalog
        where catalog.code = p_permission_code
      )
    limit 1
  ), false);
$$;

revoke all on function public.has_tenant_permission(uuid, text) from public, anon;
grant execute on function public.has_tenant_permission(uuid, text) to authenticated;

create or replace function public.get_my_tenant_permissions(p_tenant_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when membership.role in ('OWNER', 'ADMIN') then coalesce((
      select array_agg(catalog.code order by catalog.sort_order)
      from public.permission_catalog catalog
    ), array[]::text[])
    else coalesce((
      select array_agg(catalog.code order by catalog.sort_order)
      from public.permission_catalog catalog
      left join public.tenant_membership_permission_overrides override
        on override.tenant_id = membership.tenant_id
       and override.membership_id = membership.id
       and override.permission_code = catalog.code
      left join public.tenant_role_permission_defaults role_default
        on role_default.role = membership.role
       and role_default.permission_code = catalog.code
      where coalesce(override.is_allowed, role_default.is_allowed, false)
    ), array[]::text[])
  end
  from public.tenant_memberships membership
  where membership.tenant_id = p_tenant_id
    and membership.user_id = auth.uid()
    and membership.status = 'ACTIVE'
  limit 1;
$$;

revoke all on function public.get_my_tenant_permissions(uuid) from public, anon;
grant execute on function public.get_my_tenant_permissions(uuid) to authenticated;

create trigger tenant_membership_permission_overrides_set_updated_at
before update on public.tenant_membership_permission_overrides
for each row execute function public.set_updated_at();

alter table public.permission_catalog enable row level security;
alter table public.tenant_role_permission_defaults enable row level security;
alter table public.tenant_membership_permission_overrides enable row level security;

create policy permission_catalog_read_authenticated
on public.permission_catalog for select to authenticated using (true);

create policy role_permission_defaults_read_authenticated
on public.tenant_role_permission_defaults for select to authenticated using (true);

create policy membership_permission_overrides_read_self_or_manager
on public.tenant_membership_permission_overrides for select to authenticated
using (
  exists (
    select 1
    from public.tenant_memberships membership
    where membership.id = membership_id
      and membership.tenant_id = tenant_id
      and (
        membership.user_id = auth.uid()
        or public.has_tenant_role(
          tenant_id,
          array['OWNER']::public.clinic_role[]
        )
      )
  )
);

grant select on table public.permission_catalog to authenticated;
grant select on table public.tenant_role_permission_defaults to authenticated;
grant select on table public.tenant_membership_permission_overrides to authenticated;
revoke insert, update, delete on table public.tenant_memberships from authenticated;
revoke insert, update, delete on table public.tenant_membership_permission_overrides from authenticated;

create or replace function public.provision_tenant_member(
  p_tenant_id uuid,
  p_user_id uuid,
  p_display_name text,
  p_role public.clinic_role,
  p_allowed_permissions text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.clinic_role;
  membership_id uuid;
  clean_display_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  unknown_permissions text[];
begin
  select membership.role into actor_role
  from public.tenant_memberships membership
  where membership.tenant_id = p_tenant_id
    and membership.user_id = auth.uid()
    and membership.status = 'ACTIVE'
  for share;

  if actor_role not in ('OWNER', 'ADMIN') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if actor_role = 'ADMIN' and p_role = 'OWNER' then
    raise exception using errcode = '42501', message = 'ADMIN_CANNOT_MANAGE_OWNER';
  end if;
  if clean_display_name is null or char_length(clean_display_name) > 150 then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  if exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = p_tenant_id and membership.user_id = p_user_id
  ) then
    raise exception using errcode = '23505', message = 'USER_ALREADY_MEMBER';
  end if;

  select array_agg(permission_code) into unknown_permissions
  from unnest(coalesce(p_allowed_permissions, array[]::text[])) as supplied(permission_code)
  where permission_code = 'USERS_MANAGE'
     or not exists (
       select 1 from public.permission_catalog catalog
       where catalog.code = permission_code
     );
  if unknown_permissions is not null then
    raise exception using errcode = '22023', message = 'UNKNOWN_PERMISSION';
  end if;

  insert into public.profiles (user_id, display_name)
  values (p_user_id, clean_display_name)
  on conflict (user_id) do update set display_name = excluded.display_name;

  insert into public.tenant_memberships (
    tenant_id, user_id, role, status, activated_at
  ) values (p_tenant_id, p_user_id, p_role, 'ACTIVE', now())
  returning id into membership_id;

  if p_role not in ('OWNER', 'ADMIN') then
    insert into public.tenant_membership_permission_overrides (
      tenant_id, membership_id, permission_code, is_allowed
    )
    select p_tenant_id, membership_id, catalog.code,
      catalog.code = any(coalesce(p_allowed_permissions, array[]::text[]))
    from public.permission_catalog catalog;
  end if;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    p_tenant_id, auth.uid(), 'TENANT_USER_INVITED', 'TENANT_MEMBERSHIP',
    membership_id,
    jsonb_build_object(
      'role', p_role,
      'status', 'ACTIVE',
      'allowed_permissions', coalesce(to_jsonb(p_allowed_permissions), '[]'::jsonb)
    )
  );
  return membership_id;
end;
$$;

create or replace function public.provision_tenant_member(
  p_tenant_id uuid,
  p_user_id uuid,
  p_display_name text,
  p_role public.clinic_role
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.provision_tenant_member(
    p_tenant_id,
    p_user_id,
    p_display_name,
    p_role,
    coalesce((
      select array_agg(defaults.permission_code order by defaults.permission_code)
      from public.tenant_role_permission_defaults defaults
      where defaults.role = p_role and defaults.is_allowed
    ), array[]::text[])
  );
$$;

create or replace function public.manage_tenant_membership(
  p_membership_id uuid,
  p_role public.clinic_role,
  p_status public.membership_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.tenant_memberships%rowtype;
  target public.tenant_memberships%rowtype;
  other_owner_count integer;
begin
  select * into target from public.tenant_memberships
  where id = p_membership_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tenant-membership:' || target.tenant_id::text, 0)
  );

  select * into actor from public.tenant_memberships
  where tenant_id = target.tenant_id
    and user_id = auth.uid()
    and status = 'ACTIVE'
  for share;
  if actor.role not in ('OWNER', 'ADMIN') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if target.user_id = auth.uid() then
    raise exception using errcode = 'P0001', message = 'CANNOT_CHANGE_OWN_MEMBERSHIP';
  end if;
  if actor.role = 'ADMIN' and (target.role = 'OWNER' or p_role = 'OWNER') then
    raise exception using errcode = '42501', message = 'ADMIN_CANNOT_MANAGE_OWNER';
  end if;
  if p_status not in ('ACTIVE', 'SUSPENDED', 'REVOKED') then
    raise exception using errcode = '22023', message = 'INVALID_MEMBERSHIP_STATUS';
  end if;

  if target.role = 'OWNER' and target.status = 'ACTIVE'
     and (p_role <> 'OWNER' or p_status <> 'ACTIVE') then
    select count(*)::integer into other_owner_count
    from public.tenant_memberships membership
    where membership.tenant_id = target.tenant_id
      and membership.id <> target.id
      and membership.role = 'OWNER'
      and membership.status = 'ACTIVE';
    if other_owner_count = 0 then
      raise exception using errcode = 'P0001', message = 'LAST_OWNER_REQUIRED';
    end if;
  end if;

  update public.tenant_memberships
  set role = p_role,
      status = p_status,
      activated_at = case when p_status = 'ACTIVE' then coalesce(activated_at, now()) else activated_at end,
      revoked_at = case when p_status = 'REVOKED' then now() else null end
  where id = target.id;

  if p_role in ('OWNER', 'ADMIN') then
    delete from public.tenant_membership_permission_overrides
    where membership_id = target.id;
  end if;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id,
    before_summary, after_summary
  ) values (
    target.tenant_id, auth.uid(), 'TENANT_MEMBERSHIP_CHANGED',
    'TENANT_MEMBERSHIP', target.id,
    jsonb_build_object('role', target.role, 'status', target.status),
    jsonb_build_object('role', p_role, 'status', p_status)
  );
end;
$$;

create or replace function public.replace_tenant_member_permissions(
  p_membership_id uuid,
  p_allowed_permissions text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.tenant_memberships%rowtype;
  target public.tenant_memberships%rowtype;
  previous_permissions jsonb;
  unknown_permissions text[];
begin
  select * into target from public.tenant_memberships
  where id = p_membership_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;
  select * into actor from public.tenant_memberships
  where tenant_id = target.tenant_id and user_id = auth.uid() and status = 'ACTIVE'
  for share;
  if actor.role not in ('OWNER', 'ADMIN') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if target.user_id = auth.uid() then
    raise exception using errcode = 'P0001', message = 'CANNOT_CHANGE_OWN_MEMBERSHIP';
  end if;
  if target.role = 'OWNER' or (actor.role = 'ADMIN' and target.role = 'OWNER') then
    raise exception using errcode = '42501', message = 'ADMIN_CANNOT_MANAGE_OWNER';
  end if;
  if target.role = 'ADMIN' then
    delete from public.tenant_membership_permission_overrides where membership_id = target.id;
    return;
  end if;

  select array_agg(permission_code) into unknown_permissions
  from unnest(coalesce(p_allowed_permissions, array[]::text[])) as supplied(permission_code)
  where permission_code = 'USERS_MANAGE'
     or not exists (
       select 1 from public.permission_catalog catalog
       where catalog.code = permission_code
     );
  if unknown_permissions is not null then
    raise exception using errcode = '22023', message = 'UNKNOWN_PERMISSION';
  end if;

  select coalesce(jsonb_agg(permission_code order by permission_code), '[]'::jsonb)
  into previous_permissions
  from public.tenant_membership_permission_overrides
  where membership_id = target.id and is_allowed;

  delete from public.tenant_membership_permission_overrides
  where membership_id = target.id;
  insert into public.tenant_membership_permission_overrides (
    tenant_id, membership_id, permission_code, is_allowed
  )
  select target.tenant_id, target.id, catalog.code,
    catalog.code = any(coalesce(p_allowed_permissions, array[]::text[]))
  from public.permission_catalog catalog;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id,
    before_summary, after_summary
  ) values (
    target.tenant_id, auth.uid(), 'TENANT_MEMBER_PERMISSIONS_REPLACED',
    'TENANT_MEMBERSHIP', target.id,
    jsonb_build_object('allowed_permissions', previous_permissions),
    jsonb_build_object(
      'allowed_permissions', coalesce(to_jsonb(p_allowed_permissions), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.manage_tenant_membership_with_permissions(
  p_membership_id uuid,
  p_role public.clinic_role,
  p_status public.membership_status,
  p_allowed_permissions text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.manage_tenant_membership(p_membership_id, p_role, p_status);
  if p_role not in ('OWNER', 'ADMIN') then
    perform public.replace_tenant_member_permissions(
      p_membership_id,
      p_allowed_permissions
    );
  end if;
end;
$$;

revoke all on function public.provision_tenant_member(uuid, uuid, text, public.clinic_role, text[]) from public, anon;
revoke all on function public.provision_tenant_member(uuid, uuid, text, public.clinic_role) from public, anon;
revoke all on function public.manage_tenant_membership(uuid, public.clinic_role, public.membership_status) from public, anon;
revoke all on function public.replace_tenant_member_permissions(uuid, text[]) from public, anon;
revoke all on function public.manage_tenant_membership_with_permissions(uuid, public.clinic_role, public.membership_status, text[]) from public, anon;
grant execute on function public.provision_tenant_member(uuid, uuid, text, public.clinic_role, text[]) to authenticated;
grant execute on function public.provision_tenant_member(uuid, uuid, text, public.clinic_role) to authenticated;
grant execute on function public.manage_tenant_membership(uuid, public.clinic_role, public.membership_status) to authenticated;
grant execute on function public.replace_tenant_member_permissions(uuid, text[]) to authenticated;
grant execute on function public.manage_tenant_membership_with_permissions(uuid, public.clinic_role, public.membership_status, text[]) to authenticated;

alter table public.customers
  add column email text,
  add column address text,
  add column archived_at timestamptz;

alter table public.customers
  add constraint customers_email_valid check (
    email is null or email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  add constraint customers_address_length check (
    address is null or char_length(address) <= 1000
  );

create table public.tenant_patient_sequences (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  last_value bigint not null default 0 check (last_value >= 0),
  updated_at timestamptz not null default now()
);

alter table public.pets
  add column hn text,
  add column sex public.sterilization_sex,
  add column breed text,
  add column date_of_birth date,
  add column age_text text,
  add column color_markings text,
  add column microchip_number text,
  add column neutered boolean,
  add column archived_at timestamptz;

with ranked as (
  select id, tenant_id,
    row_number() over (partition by tenant_id order by created_at, id) as sequence_value
  from public.pets
)
update public.pets pet
set hn = 'HN-' || lpad(ranked.sequence_value::text, 6, '0')
from ranked
where ranked.id = pet.id;

insert into public.tenant_patient_sequences (tenant_id, last_value)
select tenant_id, count(*)::bigint from public.pets group by tenant_id
on conflict (tenant_id) do update set last_value = excluded.last_value, updated_at = now();

alter table public.pets alter column hn set not null;
alter table public.pets
  add constraint pets_hn_format check (hn ~ '^HN-[0-9]{6,}$'),
  add constraint pets_hn_tenant_unique unique (tenant_id, hn),
  add constraint pets_breed_length check (breed is null or char_length(breed) <= 120),
  add constraint pets_age_text_length check (age_text is null or char_length(age_text) <= 60),
  add constraint pets_color_markings_length check (color_markings is null or char_length(color_markings) <= 200),
  add constraint pets_microchip_length check (microchip_number is null or char_length(microchip_number) <= 80),
  add constraint pets_birth_date_valid check (date_of_birth is null or date_of_birth <= current_date);

create unique index pets_tenant_microchip_uidx
  on public.pets (tenant_id, microchip_number)
  where microchip_number is not null and archived_at is null;
create index customers_tenant_name_idx on public.customers (tenant_id, lower(full_name));
create index pets_tenant_name_idx on public.pets (tenant_id, lower(name));

alter table public.sterilization_appointments
  add column customer_id uuid,
  add column pet_id uuid,
  add foreign key (tenant_id, customer_id)
    references public.customers(tenant_id, id) on delete restrict,
  add foreign key (tenant_id, pet_id)
    references public.pets(tenant_id, id) on delete restrict;

create index sterilization_appointments_tenant_customer_idx
  on public.sterilization_appointments (tenant_id, customer_id, appointment_date desc);
create index sterilization_appointments_tenant_pet_idx
  on public.sterilization_appointments (tenant_id, pet_id, appointment_date desc);

create or replace function public.next_patient_hn(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_value bigint;
begin
  insert into public.tenant_patient_sequences (tenant_id, last_value)
  values (p_tenant_id, 1)
  on conflict (tenant_id) do update
    set last_value = public.tenant_patient_sequences.last_value + 1,
        updated_at = now()
  returning last_value into next_value;
  return 'HN-' || lpad(next_value::text, 6, '0');
end;
$$;

revoke all on function public.next_patient_hn(uuid) from public, anon, authenticated;

create or replace function public.assign_patient_hn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.hn is null then
    new.hn := public.next_patient_hn(new.tenant_id);
  elsif tg_op = 'UPDATE' and new.hn is distinct from old.hn then
    raise exception using errcode = 'P0001', message = 'HN_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger pets_assign_patient_hn
before insert or update of hn on public.pets
for each row execute function public.assign_patient_hn();

drop policy if exists customers_member_all on public.customers;
drop policy if exists pets_member_all on public.pets;

create policy customers_read_permission on public.customers
for select to authenticated
using (public.has_tenant_permission(tenant_id, 'CUSTOMERS_READ'));

create policy pets_read_permission on public.pets
for select to authenticated
using (public.has_tenant_permission(tenant_id, 'PETS_READ'));

alter table public.tenant_patient_sequences enable row level security;
revoke all on table public.tenant_patient_sequences from public, anon, authenticated;
revoke insert, update, delete on table public.customers from authenticated;
revoke insert, update, delete on table public.pets from authenticated;

create or replace function public.create_registry_customer(
  p_tenant_id uuid,
  p_full_name text,
  p_phone text,
  p_email text default null,
  p_address text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id uuid;
  clean_name text := nullif(btrim(coalesce(p_full_name, '')), '');
  clean_phone text := public.normalize_phone(p_phone);
  clean_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
begin
  if not public.has_tenant_permission(p_tenant_id, 'CUSTOMERS_WRITE') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if clean_name is null or char_length(clean_name) > 200
     or clean_phone !~ '^\+?[0-9]{8,15}$' then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_tenant_id::text || ':' || clean_phone, 0)
  );
  if exists (
    select 1 from public.customers customer
    where customer.tenant_id = p_tenant_id
      and customer.phone = clean_phone
      and customer.archived_at is null
  ) then
    raise exception using errcode = '23505', message = 'CUSTOMER_PHONE_EXISTS';
  end if;
  insert into public.customers (tenant_id, full_name, phone, email, address)
  values (
    p_tenant_id, clean_name, clean_phone, clean_email,
    nullif(btrim(coalesce(p_address, '')), '')
  ) returning id into created_id;
  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    p_tenant_id, auth.uid(), 'CUSTOMER_CREATED', 'CUSTOMER', created_id,
    jsonb_build_object('phone_last_four', right(clean_phone, 4))
  );
  return created_id;
end;
$$;

create or replace function public.add_registry_pet(
  p_customer_id uuid,
  p_name text,
  p_species public.animal_species,
  p_sex public.sterilization_sex default null,
  p_breed text default null,
  p_weight_kg numeric default null,
  p_date_of_birth date default null,
  p_age_text text default null,
  p_color_markings text default null,
  p_microchip_number text default null,
  p_neutered boolean default null
)
returns table (pet_id uuid, hn text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_tenant_id uuid;
  created_id uuid;
  created_hn text;
  clean_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  select customer.tenant_id into target_tenant_id
  from public.customers customer
  where customer.id = p_customer_id and customer.archived_at is null
  for share;
  if target_tenant_id is null then
    raise exception using errcode = 'P0002', message = 'CUSTOMER_NOT_FOUND';
  end if;
  if not public.has_tenant_permission(target_tenant_id, 'PETS_WRITE') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if clean_name is null or char_length(clean_name) > 120
     or (p_weight_kg is not null and p_weight_kg <= 0)
     or (p_date_of_birth is not null and p_date_of_birth > current_date) then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  insert into public.pets (
    tenant_id, customer_id, name, species, sex, breed, weight_kg,
    date_of_birth, age_text, color_markings, microchip_number, neutered
  ) values (
    target_tenant_id, p_customer_id, clean_name, p_species, p_sex,
    nullif(btrim(coalesce(p_breed, '')), ''), p_weight_kg, p_date_of_birth,
    nullif(btrim(coalesce(p_age_text, '')), ''),
    nullif(btrim(coalesce(p_color_markings, '')), ''),
    nullif(btrim(coalesce(p_microchip_number, '')), ''), p_neutered
  ) returning id, public.pets.hn into created_id, created_hn;
  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    target_tenant_id, auth.uid(), 'PET_CREATED', 'PET', created_id,
    jsonb_build_object('hn', created_hn, 'species', p_species)
  );
  return query select created_id, created_hn;
end;
$$;

create or replace function public.create_registry_customer_with_pets(
  p_tenant_id uuid,
  p_full_name text,
  p_phone text,
  p_email text,
  p_address text,
  p_pets jsonb
)
returns table (customer_id uuid, created_pets jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_customer_id uuid;
  pet jsonb;
  created_pet record;
  pet_results jsonb := '[]'::jsonb;
begin
  if p_pets is null
     or jsonb_typeof(p_pets) <> 'array'
     or jsonb_array_length(p_pets) not between 1 and 10 then
    raise exception using errcode = '22023', message = 'PETS_REQUIRED';
  end if;
  created_customer_id := public.create_registry_customer(
    p_tenant_id, p_full_name, p_phone, p_email, p_address
  );
  for pet in select value from jsonb_array_elements(p_pets)
  loop
    select * into created_pet
    from public.add_registry_pet(
      created_customer_id,
      pet->>'name',
      (pet->>'species')::public.animal_species,
      nullif(pet->>'sex', '')::public.sterilization_sex,
      pet->>'breed',
      nullif(pet->>'weightKg', '')::numeric,
      nullif(pet->>'dateOfBirth', '')::date,
      pet->>'ageText',
      pet->>'colorMarkings',
      pet->>'microchipNumber',
      nullif(pet->>'neutered', '')::boolean
    );
    pet_results := pet_results || jsonb_build_array(jsonb_build_object(
      'petId', created_pet.pet_id,
      'hn', created_pet.hn
    ));
  end loop;
  return query select created_customer_id, pet_results;
end;
$$;

create or replace function public.search_patient_registry(
  p_tenant_id uuid,
  p_query text
)
returns table (
  customer_id uuid,
  customer_name text,
  phone text,
  email text,
  address text,
  pets jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  clean_query text := btrim(coalesce(p_query, ''));
  normalized_query text := regexp_replace(coalesce(p_query, ''), '[^0-9+]', '', 'g');
begin
  if char_length(clean_query) < 2 or char_length(clean_query) > 120 then
    raise exception using errcode = '22023', message = 'SEARCH_QUERY_INVALID';
  end if;
  if p_tenant_id is null
     or not public.has_tenant_permission(p_tenant_id, 'CUSTOMERS_READ')
     or not public.has_tenant_permission(p_tenant_id, 'PETS_READ') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return query
  select customer.id, customer.full_name, customer.phone, customer.email,
    customer.address,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pet.id,
        'hn', pet.hn,
        'name', pet.name,
        'species', pet.species,
        'sex', pet.sex,
        'breed', pet.breed,
        'weightKg', pet.weight_kg,
        'dateOfBirth', pet.date_of_birth,
        'ageText', pet.age_text,
        'colorMarkings', pet.color_markings,
        'microchipNumber', pet.microchip_number,
        'neutered', pet.neutered
      ) order by pet.created_at, pet.id)
      from public.pets pet
      where pet.tenant_id = p_tenant_id
        and pet.customer_id = customer.id
        and pet.archived_at is null
    ), '[]'::jsonb)
  from public.customers customer
  where customer.tenant_id = p_tenant_id
    and customer.archived_at is null
    and (
      customer.phone = normalized_query
      or customer.phone like normalized_query || '%'
      or lower(customer.full_name) like lower(clean_query) || '%'
      or exists (
        select 1 from public.pets pet
        where pet.tenant_id = p_tenant_id
          and pet.customer_id = customer.id
          and pet.archived_at is null
          and (lower(pet.name) like lower(clean_query) || '%' or pet.hn = upper(clean_query))
      )
    )
  order by
    case when customer.phone = normalized_query then 0 else 1 end,
    customer.updated_at desc
  limit 20;
end;
$$;

revoke all on function public.create_registry_customer(uuid, text, text, text, text) from public, anon;
revoke all on function public.add_registry_pet(uuid, text, public.animal_species, public.sterilization_sex, text, numeric, date, text, text, text, boolean) from public, anon;
revoke all on function public.create_registry_customer_with_pets(uuid, text, text, text, text, jsonb) from public, anon;
revoke all on function public.search_patient_registry(uuid, text) from public, anon;
grant execute on function public.create_registry_customer(uuid, text, text, text, text) to authenticated;
grant execute on function public.add_registry_pet(uuid, text, public.animal_species, public.sterilization_sex, text, numeric, date, text, text, text, boolean) to authenticated;
grant execute on function public.create_registry_customer_with_pets(uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.search_patient_registry(uuid, text) to authenticated;

create or replace function public.create_registry_sterilization_appointment(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_pet_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_source_channel public.booking_channel,
  p_notes text,
  p_acknowledge_overbook boolean default false,
  p_holiday_override boolean default false
)
returns table (appointment_id uuid, appointment_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_record public.customers%rowtype;
  pet_record public.pets%rowtype;
  created record;
  appointment_species public.sterilization_species;
begin
  if not public.has_tenant_permission(p_tenant_id, 'STERILIZATION_WRITE') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  select * into customer_record
  from public.customers customer
  where customer.id = p_customer_id
    and customer.tenant_id = p_tenant_id
    and customer.archived_at is null
  for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'CUSTOMER_NOT_FOUND';
  end if;
  select * into pet_record
  from public.pets pet
  where pet.id = p_pet_id
    and pet.tenant_id = p_tenant_id
    and pet.customer_id = p_customer_id
    and pet.archived_at is null
  for share;
  if not found or pet_record.sex is null then
    raise exception using errcode = '22023', message = 'PET_SEX_REQUIRED';
  end if;
  appointment_species := pet_record.species::text::public.sterilization_species;
  select * into created
  from public.create_sterilization_appointment(
    p_tenant_id,
    p_appointment_date,
    p_appointment_time,
    customer_record.full_name,
    customer_record.phone,
    pet_record.name,
    appointment_species,
    null,
    pet_record.sex,
    pet_record.breed,
    pet_record.weight_kg,
    pet_record.age_text,
    null,
    p_source_channel,
    p_notes,
    p_acknowledge_overbook,
    p_holiday_override
  );
  update public.sterilization_appointments appointment
  set customer_id = p_customer_id,
      pet_id = p_pet_id
  where appointment.id = created.appointment_id
    and appointment.tenant_id = p_tenant_id;
  return query select created.appointment_id, created.appointment_code;
end;
$$;

revoke all on function public.create_registry_sterilization_appointment(
  uuid, uuid, uuid, date, time, public.booking_channel, text, boolean, boolean
) from public, anon;
grant execute on function public.create_registry_sterilization_appointment(
  uuid, uuid, uuid, date, time, public.booking_channel, text, boolean, boolean
) to authenticated;

create or replace function public.create_registry_priced_back_office_booking(
  p_tenant_id uuid,
  p_customer_id uuid,
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
  customer_record public.customers%rowtype;
  booking_result jsonb;
  created_entry jsonb;
  unit jsonb;
  pet jsonb;
  unit_position bigint;
  pet_position bigint;
  created_booking_id uuid;
  existing_pet public.pets%rowtype;
  temporary_customer_id uuid;
  temporary_pet_id uuid;
  requested_pet_count integer;
  distinct_pet_count integer;
begin
  if not public.has_tenant_permission(p_tenant_id, 'BOOKINGS_WRITE') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  select * into customer_record
  from public.customers customer
  where customer.id = p_customer_id
    and customer.tenant_id = p_tenant_id
    and customer.archived_at is null
  for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'CUSTOMER_NOT_FOUND';
  end if;
  if jsonb_typeof(p_units) <> 'array' then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  select count(*)::integer, count(distinct pet_entry.value->>'petId')::integer
  into requested_pet_count, distinct_pet_count
  from jsonb_array_elements(p_units) unit_entry
  cross join lateral jsonb_array_elements(unit_entry.value->'pets') pet_entry(value);
  if requested_pet_count < 1
     or requested_pet_count <> distinct_pet_count
     or exists (
       select 1
       from jsonb_array_elements(p_units) unit_entry
       cross join lateral jsonb_array_elements(unit_entry.value->'pets') pet_entry(value)
       where coalesce(pet_entry.value->>'petId', '') !~
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     ) then
    raise exception using errcode = '22023', message = 'REGISTRY_PETS_REQUIRED';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_units) unit_entry
    cross join lateral jsonb_array_elements(unit_entry.value->'pets') pet_entry(value)
    left join public.pets selected_pet
      on selected_pet.id = (pet_entry.value->>'petId')::uuid
     and selected_pet.tenant_id = p_tenant_id
     and selected_pet.customer_id = p_customer_id
     and selected_pet.species = (unit_entry.value->>'species')::public.animal_species
     and selected_pet.archived_at is null
    where selected_pet.id is null
  ) then
    raise exception using errcode = '42501', message = 'PET_SELECTION_FORBIDDEN';
  end if;

  booking_result := public.create_priced_back_office_booking(
    p_tenant_id,
    customer_record.full_name,
    customer_record.phone,
    p_line_user_id,
    p_channel,
    p_check_in_date,
    p_check_out_date,
    p_customer_notes,
    p_units
  );

  select booking_group.customer_id into temporary_customer_id
  from public.booking_groups booking_group
  where booking_group.id = (booking_result->>'bookingGroupId')::uuid
    and booking_group.tenant_id = p_tenant_id
  for update;

  update public.booking_groups
  set customer_id = p_customer_id
  where id = (booking_result->>'bookingGroupId')::uuid
    and tenant_id = p_tenant_id;

  for created_entry, unit_position in
    select entry.value, entry.ordinality
    from jsonb_array_elements(booking_result->'bookings')
      with ordinality as entry(value, ordinality)
  loop
    unit := p_units->((unit_position - 1)::integer);
    created_booking_id := (created_entry->>'bookingId')::uuid;
    for pet, pet_position in
      select entry.value, entry.ordinality
      from jsonb_array_elements(unit->'pets')
        with ordinality as entry(value, ordinality)
    loop
      select * into existing_pet
      from public.pets selected_pet
      where selected_pet.id = (pet->>'petId')::uuid
        and selected_pet.tenant_id = p_tenant_id
        and selected_pet.customer_id = p_customer_id
        and selected_pet.species = (unit->>'species')::public.animal_species
        and selected_pet.archived_at is null
      for share;
      if not found then
        raise exception using errcode = '42501', message = 'PET_SELECTION_FORBIDDEN';
      end if;

      select booking_pet.pet_id into temporary_pet_id
      from public.booking_pets booking_pet
      where booking_pet.tenant_id = p_tenant_id
        and booking_pet.booking_id = created_booking_id
        and booking_pet.position = pet_position
      for update;

      update public.file_assets
      set entity_id = existing_pet.id
      where tenant_id = p_tenant_id
        and entity_type = 'PET'
        and entity_id = temporary_pet_id;

      insert into public.pet_health_profiles (
        pet_id, tenant_id, vaccination_asset_id, flea_tick_treated,
        flea_tick_product, flea_tick_treated_on, review_notes
      )
      select existing_pet.id, health.tenant_id, health.vaccination_asset_id,
        health.flea_tick_treated, health.flea_tick_product,
        health.flea_tick_treated_on, health.review_notes
      from public.pet_health_profiles health
      where health.pet_id = temporary_pet_id
      on conflict (pet_id) do update set
        vaccination_asset_id = coalesce(
          excluded.vaccination_asset_id,
          public.pet_health_profiles.vaccination_asset_id
        ),
        flea_tick_treated = coalesce(
          excluded.flea_tick_treated,
          public.pet_health_profiles.flea_tick_treated
        ),
        flea_tick_product = coalesce(
          excluded.flea_tick_product,
          public.pet_health_profiles.flea_tick_product
        ),
        flea_tick_treated_on = coalesce(
          excluded.flea_tick_treated_on,
          public.pet_health_profiles.flea_tick_treated_on
        );
      delete from public.pet_health_profiles where pet_id = temporary_pet_id;
      update public.booking_pets
      set pet_id = existing_pet.id
      where tenant_id = p_tenant_id
        and booking_id = created_booking_id
        and position = pet_position;
      delete from public.pets
      where id = temporary_pet_id and tenant_id = p_tenant_id;
    end loop;
  end loop;

  delete from public.customers
  where id = temporary_customer_id
    and tenant_id = p_tenant_id
    and id <> p_customer_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    p_tenant_id, auth.uid(), 'BOOKING_LINKED_TO_PATIENT_REGISTRY',
    'BOOKING_GROUP', (booking_result->>'bookingGroupId')::uuid,
    jsonb_build_object(
      'customer_id', p_customer_id,
      'pet_count', requested_pet_count
    )
  );
  return booking_result;
end;
$$;

revoke all on function public.create_registry_priced_back_office_booking(
  uuid, uuid, text, public.booking_channel, date, date, text, jsonb
) from public, anon;
grant execute on function public.create_registry_priced_back_office_booking(
  uuid, uuid, text, public.booking_channel, date, date, text, jsonb
) to authenticated;

comment on column public.pets.hn is
  'Immutable tenant-scoped patient number issued separately for every pet. HN values are never reused.';
comment on function public.search_patient_registry(uuid, text) is
  'Authenticated tenant-scoped registry search. Returns at most 20 customers and active pets; no public endpoint is exposed.';
