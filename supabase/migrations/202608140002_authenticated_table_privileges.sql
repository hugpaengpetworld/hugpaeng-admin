-- RLS policies do not grant table access by themselves. Keep the base grants
-- explicit so a clean Supabase project behaves the same as an upgraded one.
grant select on table
  public.tenants,
  public.profiles,
  public.tenant_memberships,
  public.customers,
  public.pets,
  public.booking_groups,
  public.room_inventory,
  public.bookings,
  public.booking_pets,
  public.room_allocations,
  public.room_stays,
  public.audit_logs,
  public.tenant_settings,
  public.file_assets,
  public.pet_health_profiles,
  public.payments,
  public.reschedule_requests,
  public.booking_charges,
  public.receipts,
  public.receipt_items,
  public.sterilization_holidays,
  public.sterilization_appointments,
  public.platform_roles,
  public.support_access_grants,
  public.migration_runs,
  public.migration_exceptions,
  public.migration_id_maps
to authenticated;

-- These are the only browser-facing table mutations that still have matching
-- RLS write policies. Booking, room, finance, settings, and support writes stay
-- behind their transactional security-definer functions.
grant update on table public.profiles to authenticated;
grant insert, update, delete on table public.tenant_memberships to authenticated;
grant insert on table public.file_assets to authenticated;
grant insert, update, delete on table public.pet_health_profiles to authenticated;

