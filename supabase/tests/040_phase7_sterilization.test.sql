begin;

create extension if not exists pgtap with schema extensions;
select plan(17);

select has_type('public', 'sterilization_status', 'sterilization status enum exists');
select has_type('public', 'sterilization_species', 'sterilization species enum exists');
select has_type('public', 'sterilization_sex', 'sterilization sex enum exists');
select has_table('public', 'sterilization_appointments', 'appointment table exists');
select has_table('public', 'sterilization_holidays', 'holiday table exists');
select has_function(
  'public',
  'create_sterilization_appointment',
  array[
    'uuid', 'date', 'time without time zone', 'text', 'text', 'text',
    'sterilization_species', 'text', 'sterilization_sex', 'text', 'numeric',
    'text', 'text', 'booking_channel', 'text', 'boolean', 'boolean'
  ],
  'atomic appointment creation function exists'
);
select has_function(
  'public', 'update_sterilization_status',
  array['uuid', 'sterilization_status'],
  'allowlisted status mutation function exists'
);
select has_function(
  'public', 'save_sterilization_holiday',
  array['uuid', 'date', 'text', 'boolean'],
  'authorized holiday function exists'
);
select is(
  public.sterilization_status_consumes_capacity('PENDING_CONFIRMATION'),
  true,
  'pending appointments consume capacity'
);
select is(
  public.sterilization_status_consumes_capacity('COMPLETED'),
  false,
  'completed appointments do not consume future capacity'
);
select is(
  public.sterilization_status_consumes_capacity('CANCELLED'),
  false,
  'cancelled appointments release capacity'
);
select is(
  public.can_transition_sterilization_status('PENDING_CONFIRMATION', 'CONFIRMED'),
  true,
  'pending can be confirmed'
);
select is(
  public.can_transition_sterilization_status('CONFIRMED', 'ARRIVED'),
  true,
  'confirmed can arrive'
);
select is(
  public.can_transition_sterilization_status('COMPLETED', 'CONFIRMED'),
  false,
  'terminal appointments cannot reactivate silently'
);
select is(
  (
    select count(*)::integer from pg_policies
    where schemaname = 'public'
      and tablename = 'sterilization_appointments'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  0,
  'appointments cannot bypass audited mutation functions'
);
select is(
  (
    select count(*)::integer from pg_policies
    where schemaname = 'public'
      and tablename = 'sterilization_holidays'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  0,
  'holidays cannot bypass audited mutation functions'
);
select matches(
  public.next_sterilization_code(
    '00000000-0000-4000-8000-000000000001',
    date '2026-08-05'
  ),
  '^SPAY-20260805-[0-9]{4}$',
  'appointment code uses an atomic daily sequence'
);

select * from finish();
rollback;
