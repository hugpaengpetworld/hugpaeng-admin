insert into public.tenants (
  id,
  slug,
  thai_name,
  english_name,
  timezone,
  currency,
  status
) values (
  '00000000-0000-4000-8000-000000000001',
  'baan-mhor-poy',
  'คลินิกบ้านหมอปอยรักษาสัตว์',
  'Baan Mhor Poy Vet Clinic',
  'Asia/Bangkok',
  'THB',
  'ACTIVE'
)
on conflict (id) do update set
  slug = excluded.slug,
  thai_name = excluded.thai_name,
  english_name = excluded.english_name,
  timezone = excluded.timezone,
  currency = excluded.currency,
  status = excluded.status;

insert into public.tenant_settings (tenant_id)
values ('00000000-0000-4000-8000-000000000001')
on conflict (tenant_id) do nothing;

insert into public.room_inventory (tenant_id, room_code, species)
select
  '00000000-0000-4000-8000-000000000001',
  'CAT' || lpad(room_number::text, 2, '0'),
  'CAT'
from generate_series(1, 11) as room_number
on conflict (tenant_id, room_code) do nothing;

insert into public.room_inventory (tenant_id, room_code, species)
select
  '00000000-0000-4000-8000-000000000001',
  'DOG' || lpad(room_number::text, 2, '0'),
  'DOG'
from generate_series(1, 7) as room_number
on conflict (tenant_id, room_code) do nothing;

-- Auth users are never fabricated in seed data. Run `npm run owner:invite -- --email ...`
-- after local/staging Supabase is available to create the first OWNER membership safely.
