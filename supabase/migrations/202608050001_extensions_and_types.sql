create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

create type public.tenant_status as enum ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
create type public.clinic_role as enum ('OWNER', 'DOCTOR', 'STAFF');
create type public.membership_status as enum ('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED');
create type public.animal_species as enum ('CAT', 'DOG');
create type public.booking_channel as enum (
  'WEBSITE',
  'LINE',
  'FACEBOOK',
  'PHONE',
  'WALK_IN',
  'OTHER'
);
create type public.boarding_service_type as enum ('OVERNIGHT', 'DAY_CARE', 'EMERGENCY_OWN_CAGE');
create type public.booking_status as enum (
  'PENDING_APPROVAL',
  'APPROVED_AWAITING_DEPOSIT',
  'CONFIRMED',
  'CHECKED_IN',
  'CHECKED_OUT',
  'REJECTED',
  'EXPIRED_PAYMENT',
  'CANCELLED_NO_REFUND',
  'NO_SHOW'
);
create type public.payment_status as enum (
  'NOT_REQUIRED',
  'WAITING',
  'SUBMITTED',
  'VERIFIED',
  'WAIVED',
  'EXPIRED',
  'FORFEITED',
  'REFUND_DUE',
  'REFUNDED'
);
create type public.health_review_status as enum ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');
create type public.room_operational_status as enum ('AVAILABLE', 'CLEANING', 'MAINTENANCE', 'DISABLED');
create type public.allocation_status as enum ('HOLD', 'RESERVED', 'RELEASED', 'CANCELLED', 'EXPIRED');
create type public.outbox_status as enum ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

comment on type public.booking_status is
  'Server-enforced allowlist from docs/STATE_MACHINES.md; never render raw values to users.';
