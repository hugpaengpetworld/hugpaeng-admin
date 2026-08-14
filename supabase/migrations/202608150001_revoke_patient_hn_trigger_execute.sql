-- Trigger functions run through their owning trigger and must not remain
-- directly executable by API roles through PostgreSQL's default PUBLIC grant.
revoke all on function public.assign_patient_hn()
from public, anon, authenticated;
