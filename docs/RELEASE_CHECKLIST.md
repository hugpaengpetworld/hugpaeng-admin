# Version 1 Release Checklist

Last reviewed: 2026-08-14 (Asia/Bangkok)

Status meanings: `OPEN` still requires work, `BLOCKED` requires an OWNER decision or external access, and `CLOSED` has repeatable evidence that meets the release criterion.

| Order | Release gate | Status | Evidence required to close |
| --- | --- | --- | --- |
| 1 | Data strategy | CLOSED | OWNER selected `CLEAN_SEED`; the decision and clean-production boundaries are recorded in `docs/DECISIONS.md` and `docs/MIGRATION_PLAN.md`. |
| 2 | Staging database and automated integrity | CLOSED | GitHub Actions Linux run `31786774396` rebuilt Supabase from an empty database, passed database lint, pgTAP, and all 34 integration tests with no skips. The linked staging run also passed 34/34 and its fixture audit is clean. |
| 3 | Backup and restore drill | OPEN | An isolated restore target passes schema, data/financial reconciliation, Auth smoke tests, and critical workflows; evidence is stored outside source control. |
| 4 | Application and Cloudflare build | OPEN | Format, lint, strict TypeScript, unit tests, Next.js build, and OpenNext Cloudflare Worker build pass from the exact release source. |
| 5 | Staging deployment and smoke tests | OPEN | Auth, public booking, room planning, check-in/out, PromptPay settlement, receipt print, cron, and outbox are verified on a non-production URL. |
| 6 | Production configuration and security | BLOCKED | OWNER-approved domain, Supabase Auth redirects, Cloudflare secrets, LINE decision/credentials, retention, finance permissions, support policy, and monitoring are configured outside Git. |
| 7 | Device and clinic acceptance | OPEN | OWNER signs off critical flows on desktop, tablet, and smartphone, including keyboard/accessibility and 80 mm receipt print. |
| 8 | Cutover and rollback | OPEN | Exact release identifier, write-freeze/delta plan when applicable, smoke checklist, rollback owner, and post-write reconciliation procedure are approved. |

## Evidence captured so far

- Gate 1 closed: the OWNER selected `CLEAN_SEED` on 2026-08-14. Production will be a separate clean project built only from reviewed migrations/seed and newly provisioned Auth users.
- The reviewed seed contains only the first tenant, tenant settings, CAT01–CAT11, and DOG01–DOG07. It does not fabricate Auth users or insert customers, pets, bookings, stays, payments, receipts, or audit activity.
- Supabase Cloud migration history matches all 27 local migrations through `202608140001`.
- Linked `public` and `extensions` schema lint reports no errors.
- Local `.env.local` contains Supabase, service-role, application URL, cron, and rate-limit values; it does not contain LINE credentials or `TEST_DATABASE_URL`. Local presence is not evidence that Cloudflare production secrets are configured.
- Cloudflare Wrangler is not authenticated on this machine.
- Latest local checks on 2026-08-14: formatter, lint, strict TypeScript, 64 unit tests, and Next.js production build pass. The default test command skips 34 database integration assertions when `TEST_DATABASE_URL` is absent.
- `npm run test:integration:staging` accepts only the database password through a masked PowerShell prompt, builds the URI from the linked Session pooler URL with percent-encoding, keeps it process-only, and clears it after the run.
- The 2026-08-14 staging integration attempt reached the Supabase Session pooler but authentication was rejected before fixture setup (`password authentication failed`); all 34 assertions were skipped and no test fixture was created.
- The authenticated staging rerun passed 33 of 34 assertions and exposed a real room-plan check-in replay bug plus a test-only platform-role cleanup ordering issue. Migration `202608140001` and regression coverage were applied; a final authenticated rerun is pending.
- The post-migration rerun verified the idempotency and cleanup fixes. It passed 33 of 34 tests; the remaining workflow crossed Vitest's default five-second limit by 14 ms on Supabase Cloud without an assertion or database error. The integration-only timeout is now 20 seconds, with a 30-second hook timeout, pending one final rerun.
- The final authenticated Supabase staging run passed all 6 integration files and all 34 tests with no skips.
- A service-role read-only audit found zero Auth users ending in `@example.invalid` and zero associated platform roles. No stale integration fixture requires deletion.
- Gate 2 closed on 2026-08-14: GitHub Actions Linux quality run [`31786774396`](https://github.com/hugpaengpetworld/hugpaeng-admin/actions/runs/31786774396) passed both jobs. The database job started local Supabase, reset from an empty database, ran database lint, pgTAP, and all 34 integration tests successfully. The application job also passed formatter, lint, strict TypeScript, unit tests, Next.js production build, and OpenNext Cloudflare Worker build for commit `53b4d9f`.
- OpenNext Cloudflare build does not complete on the current Windows environment, but it passed in Linux CI for commit `53b4d9f`. Gate 4 remains open until the exact release candidate is identified after the Gate 3 restore drill and the checks are repeated for that source.

## Owner decisions still required

1. Whether LINE notifications are in Version 1 or explicitly disabled for launch.
2. Production domain and cutover date.
3. Data retention, finance authorization, support-access operating policy, restore objectives, and final clinic acceptance.
