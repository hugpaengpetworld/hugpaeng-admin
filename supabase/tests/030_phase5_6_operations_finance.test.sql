begin;

create extension if not exists pgtap with schema extensions;
select plan(26);

select has_table('public', 'booking_charges', 'checkout charge facts exist');
select has_table('public', 'receipts', 'immutable receipt headers exist');
select has_table('public', 'receipt_items', 'immutable receipt items exist');
select has_function(
  'public', 'check_in_booking',
  array['uuid', 'uuid', 'integer', 'text', 'integer', 'text'],
  'transactional check-in function exists'
);
select has_function(
  'public', 'preview_checkout', array['uuid'],
  'checkout preview function exists'
);
select has_function(
  'public', 'check_out_booking',
  array['uuid', 'jsonb', 'jsonb', 'boolean', 'text', 'integer', 'text'],
  'transactional checkout function exists'
);
select has_function(
  'public', 'record_refund', array['uuid', 'text', 'text', 'text'],
  'matching-account refund function exists'
);
select has_function(
  'public', 'void_receipt', array['uuid', 'text'],
  'owner receipt void function exists'
);
select has_function(
  'public', 'reissue_receipt', array['uuid', 'text'],
  'owner receipt reissue function exists'
);
select has_function(
  'public', 'regenerate_receipt_artifact', array['uuid'],
  'recoverable receipt artifact function exists'
);
select is(
  (
    select count(*)::integer from pg_policies
    where schemaname = 'public' and tablename = 'booking_charges'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ), 0, 'charge writes cannot bypass transactional checkout'
);
select is(
  (
    select count(*)::integer from pg_policies
    where schemaname = 'public' and tablename = 'receipts'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ), 0, 'receipt writes cannot bypass audited functions'
);
select is(
  (
    select count(*)::integer from pg_policies
    where schemaname = 'public' and tablename = 'receipt_items'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ), 0, 'receipt item writes cannot bypass audited functions'
);
select col_type_is(
  'public', 'receipts', 'total_satang', 'integer',
  'receipt totals use integer satang'
);

select has_column(
  'public', 'tenant_settings', 'clinic_address',
  'tenant settings store the receipt address'
);

select has_column(
  'public', 'receipts', 'clinic_address',
  'receipts snapshot the clinic address'
);
select has_column(
  'public', 'payments', 'booking_group_id',
  'payment facts are scoped to a booking group'
);
select has_column(
  'public', 'receipts', 'booking_group_id',
  'combined receipts are scoped to a booking group'
);
select has_column(
  'public', 'tenant_settings', 'receipt_tax_enabled',
  'tax receipt display is explicitly opt in'
);
select has_column(
  'public', 'tenant_settings', 'receipt_tax_heading',
  'owner can configure the tax heading'
);
select has_column(
  'public', 'tenant_settings', 'tax_id',
  'owner can configure a tax id'
);
select has_column(
  'public', 'tenant_settings', 'branch_number',
  'owner can configure a branch identifier'
);
select has_column(
  'public', 'receipts', 'tax_section_enabled',
  'receipt snapshots whether tax identity was enabled'
);
select has_column(
  'public', 'receipts', 'tax_id',
  'receipt snapshots configured tax identity'
);
select col_type_is(
  'public', 'booking_charges', 'amount_satang', 'integer',
  'charge totals use integer satang'
);
select results_eq(
  $$ select public.next_receipt_number('00000000-0000-4000-8000-000000000001') ~
       '^BMP-RCP-[0-9]{8}-[0-9]{4}$' $$,
  array[true],
  'receipt number follows the required format'
);

select * from finish();
rollback;
