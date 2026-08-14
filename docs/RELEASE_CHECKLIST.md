# Version 1 Release Checklist

Last reviewed: 2026-08-15 (Asia/Bangkok)

Status meanings: `OPEN` still requires work, `BLOCKED` requires an OWNER decision or external access, and `CLOSED` has repeatable evidence that meets the release criterion.

| Order | Release gate | Status | Evidence required to close |
| --- | --- | --- | --- |
| 1 | Data strategy | CLOSED | OWNER selected `CLEAN_SEED`; the decision and clean-production boundaries are recorded in `docs/DECISIONS.md` and `docs/MIGRATION_PLAN.md`. |
| 2 | Staging database and automated integrity | CLOSED | The linked CLEAN staging database was rebuilt from empty and migration history matches through `202608150001`; schema lint, pgTAP, all 7 integration files, and all 39 tests passed. The post-test fixture audit found no Auth users, memberships, customers, pets, booking groups, or receipts. |
| 3 | Backup and restore drill | CLOSED | GitHub Actions restore drill [`31830796846`](https://github.com/hugpaengpetworld/hugpaeng-admin/actions/runs/31830796846) restored commit `a0203d9` from hard-locked CLEAN staging into the isolated restore target, reconciled schema and application data, passed Auth smoke tests and all 39 database integration tests, cleaned fixtures, and removed ephemeral backup files. |
| 4 | Application and Cloudflare build | OPEN | Format, lint, strict TypeScript, unit tests, Next.js build, and OpenNext Cloudflare Worker build pass from the exact release source. |
| 5 | Staging deployment and smoke tests | OPEN | Auth, public booking, room planning, check-in/out, PromptPay settlement, receipt print, cron, and outbox are verified on a non-production URL. |
| 6 | Production configuration and security | BLOCKED | OWNER-approved domain, Supabase Auth redirects, Cloudflare secrets, LINE decision/credentials, retention, finance permissions, support policy, and monitoring are configured outside Git. |
| 7 | Device and clinic acceptance | OPEN | OWNER signs off critical flows on desktop, tablet, and smartphone, including keyboard/accessibility and 80 mm receipt print. |
| 8 | Cutover and rollback | OPEN | Exact release identifier, write-freeze/delta plan when applicable, smoke checklist, rollback owner, and post-write reconciliation procedure are approved. |

## Evidence captured so far

- Gate 1 closed: the OWNER selected `CLEAN_SEED` on 2026-08-14. Production will be a separate clean project built only from reviewed migrations/seed and newly provisioned Auth users.
- The reviewed seed contains only the first tenant, tenant settings, CAT01–CAT11, and DOG01–DOG07. It does not fabricate Auth users or insert customers, pets, bookings, stays, payments, receipts, or audit activity.
- The OWNER explicitly approved `bmp-booking-dev` (`wnnxdcxuxupmnplkegkt`) as destructive CLEAN staging. On 2026-08-14 it was reset from migrations `202608050001`–`202608140005` and `supabase/seed.sql`; local and remote migration histories now match through `202608140005`.
- Linked `public` and `extensions` schema lint reports no errors.
- Local `.env.local` contains Supabase, service-role, application URL, cron, and rate-limit values; it does not contain LINE credentials or `TEST_DATABASE_URL`. Local presence is not evidence that Cloudflare production secrets are configured.
- Cloudflare Wrangler is not authenticated on this machine.
- Latest local checks on 2026-08-14: formatter, lint, strict TypeScript, 64 non-database tests, Next.js production build, and OpenNext Cloudflare Worker build pass. The default test command skips 39 database integration assertions when `TEST_DATABASE_URL` is absent. Both the full and production-only `npm audit` report zero known vulnerabilities after pinning the patched `nanoid` release.
- `npm ci --dry-run --ignore-scripts` accepts the updated lockfile. Before the authorized reset, the linked Supabase `db push --dry-run` reported exactly migrations `202608140002`–`202608140005` pending with no seed or role writes.
- Post-reset staging evidence: schema lint reports no errors; the expanded authenticated run passed all 7 integration files and all 39 tests with no skips. The post-test audit found zero Auth users, tenant memberships, customers, pets, booking groups, receipts, test users, and test platform roles. The seed contains exactly one tenant and its configured room inventory.
- Supabase CLI's pgTAP command still requires Docker on this Windows host even with `--linked`, so it could not run locally. The database integration suite connects directly through the masked Session pooler password prompt and is the available staging verification path.
- `npm run test:integration:staging` accepts only the database password through a masked PowerShell prompt, builds the URI from the linked Session pooler URL with percent-encoding, keeps it process-only, and clears it after the run.
- The 2026-08-14 staging integration attempt reached the Supabase Session pooler but authentication was rejected before fixture setup (`password authentication failed`); all 34 assertions were skipped and no test fixture was created.
- The authenticated staging rerun passed 33 of 34 assertions and exposed a real room-plan check-in replay bug plus a test-only platform-role cleanup ordering issue. Migration `202608140001` and regression coverage were applied; a final authenticated rerun is pending.
- The post-migration rerun verified the idempotency and cleanup fixes. It passed 33 of 34 tests; the remaining workflow crossed Vitest's default five-second limit by 14 ms on Supabase Cloud without an assertion or database error. The integration-only timeout is now 20 seconds, with a 30-second hook timeout, pending one final rerun.
- The final authenticated Supabase staging run passed all 6 integration files and all 34 tests with no skips.
- A service-role read-only audit found zero Auth users ending in `@example.invalid` and zero associated platform roles. No stale integration fixture requires deletion.
- Gate 2 closed on 2026-08-14: GitHub Actions Linux quality run [`31786774396`](https://github.com/hugpaengpetworld/hugpaeng-admin/actions/runs/31786774396) passed both jobs. The database job started local Supabase, reset from an empty database, ran database lint, pgTAP, and all 34 integration tests successfully. The application job also passed formatter, lint, strict TypeScript, unit tests, Next.js production build, and OpenNext Cloudflare Worker build for commit `53b4d9f`.
- OpenNext Cloudflare build passed in the current Windows workspace and previously passed in Linux CI for commit `53b4d9f`. Gate 4 remains open until the exact release candidate is identified after the Gate 3 restore drill and the checks are repeated for that source.
- Gate 2 was reopened after approval of the six-role capability model and central patient registry, then closed again on 2026-08-14 after the authorized CLEAN staging rebuild, expanded 39-test integration run, and zero-fixture audit all passed.
- Gate 3 preparation on 2026-08-14 confirmed that `supabase db dump --linked` can authenticate to CLEAN staging but requires Docker to run `pg_dump` on this Windows host. Docker and native PostgreSQL client tools are unavailable, no valid dump was produced, and the three zero-byte output files were removed. The restore drill must use an isolated Supabase target and either a Linux CI runner with protected database secrets or approved PostgreSQL client tooling; it must never restore over the verified CLEAN staging source.
- The OWNER created isolated Supabase restore target `bmp-booking-restore-drill` (`svgmzjphmdqfeptalxhe`) in Singapore. The manual Linux workflow is hard-locked to that target and source `wnnxdcxuxupmnplkegkt`; protected passwords and API keys are stored only as GitHub Actions repository secrets.
- Security regression coverage identified that trigger function `public.assign_patient_hn()` was executable by exposed roles. Migration `202608150001` revoked that privilege from `public`, `anon`, and `authenticated`; GitHub Actions quality run [`31830248965`](https://github.com/hugpaengpetworld/hugpaeng-admin/actions/runs/31830248965) then passed both application and database jobs for commit `a0203d9`, and the migration was applied to CLEAN staging with matching local/remote history.
- Gate 3 closed on 2026-08-15: restore drill [`31830796846`](https://github.com/hugpaengpetworld/hugpaeng-admin/actions/runs/31830796846) completed successfully for commit `a0203d9` in 7 minutes 42 seconds. The workflow created checksum evidence in the ephemeral runner without uploading database artifacts, reset only the hard-locked isolated target, restored the `public` application schema and data, reconciled every public table and financial totals, passed Auth create/login/delete smoke tests, passed all 7 integration files and all 39 tests, cleaned test fixtures, and securely removed temporary backup files. The GitHub Node.js 20 action-runtime deprecation annotation is non-blocking workflow-maintenance debt; it did not skip or fail any release assertion.

## Owner decisions still required

1. Whether LINE notifications are in Version 1 or explicitly disabled for launch.
2. Production domain and cutover date.
3. Data retention, finance authorization, support-access operating policy, restore objectives, and final clinic acceptance.
