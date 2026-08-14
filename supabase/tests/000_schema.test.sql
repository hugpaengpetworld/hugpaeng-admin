begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

select has_table('public', 'tenants', 'tenants exists');
select has_table('public', 'tenant_memberships', 'tenant memberships exist');
select has_table('public', 'bookings', 'bookings exist');
select has_table('public', 'room_allocations', 'planned allocations exist');
select has_table('public', 'room_stays', 'physical stays exist');
select has_table('public', 'audit_logs', 'audit scaffold exists');
select has_table('public', 'outbox_events', 'outbox scaffold exists');
select has_table('public', 'pet_health_profiles', 'restricted pet health facts exist');
select has_function(
  'public',
  'allocate_planned_room',
  array['uuid', 'uuid', 'allocation_status'],
  'atomic allocation function exists'
);
select has_function(
  'public',
  'can_transition_booking_status',
  array['booking_status', 'booking_status'],
  'booking transition allowlist exists in PostgreSQL'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.bookings'::regclass),
  'bookings has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.room_inventory'::regclass),
  'room inventory has RLS enabled'
);
select is(
  (select count(*)::integer from public.room_inventory where species = 'CAT'),
  11,
  'seed contains CAT01-CAT11'
);
select is(
  (select count(*)::integer from public.room_inventory where species = 'DOG'),
  7,
  'seed contains DOG01-DOG07'
);
select ok(
  public.can_transition_booking_status('CONFIRMED', 'CHECKED_IN')
    and not public.can_transition_booking_status('CHECKED_OUT', 'CONFIRMED'),
  'database status allowlist accepts and rejects expected transitions'
);

select * from finish();
rollback;
