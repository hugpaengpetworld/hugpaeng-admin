# Implementation Plan

Each phase ends with working code, automated checks, documentation, and a user review checkpoint.

## Phase 0 — Repository and tooling

- Scaffold Next.js App Router, strict TypeScript, Tailwind.
- Add formatting, linting, unit/integration test framework, env validation, and CI.
- Configure Supabase local/staging and OpenNext/Wrangler.
- Establish feature/domain/data/integration boundaries.

Exit: clean build, lint, typecheck, sample test, documented local setup.

## Phase 1 — Database, auth, and tenancy

- Create core migrations, enum/check constraints, indexes, RLS, audit scaffolding, and seeds.
- Supabase Auth profiles and tenant memberships.
- Seed clinic, CAT01–CAT11, DOG01–DOG07, and owner invite path.
- Transactional functions for code generation and planned room allocation.
- Tests for tenant isolation and concurrent overlap.

Exit: migrations can apply from empty database; RLS tests and concurrency tests pass.

## Phase 2 — Admin shell, rooms, and settings

- Responsive dark-green shell and role-aware navigation.
- Login/logout and protected routes.
- Clinic branding/settings and logo upload.
- Separate cat/dog room planning screens, date navigation, status overlay, details, and operational states.

Exit: rooms display correct state and a simulated/open stay cannot appear available.

## Phase 3 — Booking and customer/pet records

- Booking groups, per-room booking units, customers, pets, and back-office form.
- Public availability count and overnight request.
- Pricing/capacity validation and room holds.
- Room dropdown filtered by species and valid period.

Exit: single/multi-room flows and race tests pass; mobile forms usable.

## Phase 4 — Review, deposit, and notifications

- Approval/rejection workflow.
- LINE-only deposit deadline and verification.
- Outbox, scheduled expiry, idempotent LINE notifications.
- Public status and one-time reschedule request.

Exit: one-hour expiry releases planned capacity exactly once and notification retry is safe.

## Phase 5 — Check-in and checkout

- Waiting and active/checkout combined operational lists with species filters and required columns.
- Deposit/notes at check-in.
- Physical stay model and atomic check-in/out.
- Checkout charges, early confirmation, room-to-cleaning transition, and conflict handling.

Exit: open stay persists past planned checkout; only checkout releases occupancy.

## Phase 6 — Finance and receipts

- Payment/refund facts, matching-account verification workflow.
- Immutable receipts/items, numbering, void/reissue, regeneration.
- 80 mm print view and browser receipt printing.

Exit: financial totals and immutability tests pass; print QA completed.

## Phase 7 — Sterilization

- Calendar, lists, appointment form, age/vaccination/custom species/sex.
- Four/full red, over-four purple, explicit audited overbook.
- Holiday management and clickable animal details.

Exit: capacity colors/counting and role tests pass.

## Phase 8 — Platform foundation and support access

- Platform Owner tenant management foundation.
- Time-limited Support Access grants, banner, expiry/revoke, audit linkage.
- No automatic broad tenant data access.

Exit: expired/revoked grants fail at server/RLS level and support actions are traceable.

## Phase 9 — Migration and release

- Repeatable import tool and exception report.
- Staging rehearsal, data reconciliation, end-to-end tests.
- Backup/restore drill, production secrets, Cloudflare deployment, domain and monitoring.
- Clinic owner acceptance and cutover.

Exit: `ACCEPTANCE_TESTS.md` passes and rollback/cutover is documented.

### Version 1 registry and capability hardening before Gate 3

- Expand clinic roles to OWNER, ADMIN, DOCTOR, STAFF, COUNTER, and ASSISTANT.
- Add OWNER/ADMIN-managed per-user capabilities; ADMIN cannot manage OWNER.
- Add the central customer/patient registry, immutable per-pet HN, multi-pet selection, and registry-backed boarding/sterilization creation.
- Re-run the clean staging migration and full integration suite before continuing backup/restore Gate 3.
- Keep full EMR, IDEXX/device integration, IPD, treatment/inventory/POS/payroll and referral workflows out of Version 1 unless separately approved.
