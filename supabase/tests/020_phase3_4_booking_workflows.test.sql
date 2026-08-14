begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

select has_table('public', 'payments', 'payment facts table exists');
select has_table('public', 'reschedule_requests', 'reschedule request table exists');
select has_table('public', 'idempotency_keys', 'idempotency table exists');
select has_table('public', 'public_rate_limit_buckets', 'public rate limit table exists');
select has_function(
  'public',
  'create_back_office_booking',
  array['uuid', 'text', 'text', 'text', 'booking_channel', 'date', 'date', 'text', 'jsonb'],
  'transactional back-office booking function exists'
);
select has_function(
  'public',
  'create_public_booking_request',
  array['text', 'text', 'text', 'text', 'text', 'text', 'date', 'date', 'animal_species', 'jsonb', 'text'],
  'idempotent public booking function exists'
);
select has_function(
  'public',
  'review_booking',
  array['uuid', 'text', 'text', 'integer'],
  'review transition function exists'
);
select has_function(
  'public',
  'expire_due_line_deposits',
  array['integer'],
  'idempotent expiry function exists'
);
select has_function(
  'public',
  'request_public_reschedule',
  array['text', 'text', 'text', 'date', 'date', 'text'],
  'public reschedule request function exists'
);
select has_function(
  'public',
  'claim_outbox_events',
  array['integer'],
  'outbox claim function exists'
);
select is(
  (
    select count(*)::integer from pg_policies
    where schemaname = 'public'
      and tablename = 'bookings'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  0,
  'booking writes cannot bypass transactional functions'
);
select is(
  (
    select count(*)::integer from pg_policies
    where schemaname = 'public'
      and tablename = 'payments'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  0,
  'payment writes cannot bypass verified workflow functions'
);
select is(
  (
    select count(*)::integer from pg_policies
    where schemaname = 'public'
      and tablename = 'tenant_settings'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  0,
  'tenant settings writes must use the audited owner function'
);

select * from finish();
rollback;
