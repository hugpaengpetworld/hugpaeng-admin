# Release Runbook

## Current release gate

Repository implementation covers Phase 0–9, but production cutover is blocked until every item marked **OWNER DECISION** or **EXTERNAL** below is completed. A successful build alone is not production approval.

## 1. Data strategy — OWNER DECISION

Choose exactly one and record it in `docs/DECISIONS.md`:

1. `CLEAN_SEED`: keep the seeded clinic/settings/rooms and create users through Supabase Auth invitations. Do not import experimental customer/booking/finance data.
2. `LEGACY_IMPORT`: export every live legacy sheet and Drive upload manifest, run `npm run migration:rehearse`, review every exception, then build and approve the domain import mapping before staging.

Never import legacy password hashes, salts, sessions, GAS tokens, gateway keys, or LINE secrets.

## 2. Staging rehearsal

1. Create or reset a non-production Supabase project.
2. Run `npx supabase db push --dry-run`, then `npx supabase db push`.
3. Run the chosen migration rehearsal and save its SHA-256 checksum/report outside source control.
4. Reconcile source/target counts by entity/status and all payment/charge/receipt totals.
5. Verify no duplicate booking/receipt codes, invalid room/species pairs, overlapping active allocations, or multiple open stays.
6. Run unit, pgTAP, database integration, Next.js build, and OpenNext Cloudflare build.

## 3. Backup/restore drill — EXTERNAL

Follow `docs/BACKUP_RESTORE.md` against staging. Record project reference, backup timestamp, restore target, start/end time, row-count reconciliation, checksum evidence, tester, and disposition. Never paste database passwords into reports.

## 4. Production configuration — OWNER DECISION / EXTERNAL

- Configure Supabase Auth Site URL and redirect allowlist for the production domain.
- Configure Cloudflare secrets outside Git: Supabase URL/public key/service secret, cron/rate-limit secrets, and LINE credentials.
- Confirm data retention for vaccination documents, slips, cancelled requests, audit events, receipts, and backups.
- Confirm permanent finance authorization for doctor/staff cancellation, adjustments, void/reissue, and refunds.
- Confirm Temporary Support Access operating policy. The implementation requires an explicit duration and caps every grant at 24 hours; it does not choose a default duration.
- Configure monitoring for `/`, `/login`, cron failures, outbox failures, Supabase resource limits, and Cloudflare exceptions without logging customer records.

## 5. Acceptance and cutover — EXTERNAL

1. Complete every item in `docs/ACCEPTANCE_TESTS.md` on desktop, iPad/tablet, and smartphone.
2. Owner signs off the chosen data strategy, exception dispositions, receipt print preview, permissions, and operational flows.
3. Announce legacy write freeze and take a final delta export if importing.
4. Apply production migrations before application promotion.
5. Deploy the exact tested build, run smoke tests, then switch `bmpbooking.hug-paeng.com`.
6. Keep legacy read-only for the approved audit period.

## 6. Rollback

- Before traffic switch: stop and fix forward in staging.
- After switch but before new writes: route traffic back to legacy and investigate.
- After new writes: do not create split-brain by blindly routing back. Freeze writes, export new-system deltas, reconcile, and obtain owner approval for the recovery direction.
- Database schema rollback uses a reviewed forward-fix unless a separately tested reversible migration exists. Never use destructive reset on production.
