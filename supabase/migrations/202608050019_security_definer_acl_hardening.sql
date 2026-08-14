-- RLS predicates need authenticated execution, but must not inherit PostgreSQL's
-- default PUBLIC/anon EXECUTE privilege. Trigger functions require no client ACL.
revoke all on function public.has_tenant_role(
  uuid, public.clinic_role[]
) from public, anon;
grant execute on function public.has_tenant_role(
  uuid, public.clinic_role[]
) to authenticated;

revoke all on function public.is_active_tenant_member(uuid)
  from public, anon;
grant execute on function public.is_active_tenant_member(uuid)
  to authenticated;

revoke all on function public.shares_active_tenant_with(uuid)
  from public, anon;
grant execute on function public.shares_active_tenant_with(uuid)
  to authenticated;

revoke all on function public.has_platform_role(public.platform_role[])
  from public, anon;
grant execute on function public.has_platform_role(public.platform_role[])
  to authenticated;

revoke all on function public.has_active_support_access(uuid, text)
  from public, anon;
grant execute on function public.has_active_support_access(uuid, text)
  to authenticated;

revoke all on function public.enforce_booking_status_transition()
  from public, anon, authenticated;
