# AGENTS.md

## Mission

Build a production-ready replacement for the clinic booking system described in `PROJECT_HANDOFF.md`. The replacement must preserve the accepted behavior of the legacy v1.8.3 system while removing Google Apps Script and Google Sheets completely.

`PROJECT_HANDOFF.md` and the files in `docs/` are the authoritative product specification. Files under `legacy-v1.8.3/` are read-only behavioral references, not the architecture to continue.

## Required reading order

Before changing code, read these files in order:

1. `PROJECT_HANDOFF.md`
2. `docs/PRODUCT_REQUIREMENTS.md`
3. `docs/BUSINESS_RULES.md`
4. `docs/STATE_MACHINES.md`
5. `docs/DATA_MODEL.md`
6. `docs/ARCHITECTURE.md`
7. `docs/RBAC_AND_SECURITY.md`
8. `docs/UI_UX_SPEC.md`
9. `docs/ACCEPTANCE_TESTS.md`
10. `docs/IMPLEMENTATION_PLAN.md`

If documents conflict, the most recent explicit rule in `PROJECT_HANDOFF.md` wins. Record any remaining conflict in `docs/DECISIONS.md`; do not silently choose behavior that affects money, room capacity, authorization, or customer data.

## Fixed technology direction

- Next.js App Router with strict TypeScript.
- Tailwind CSS for the interface.
- Supabase PostgreSQL, Auth, and Storage.
- SQL migrations under `supabase/migrations/`.
- Cloudflare Workers deployment through OpenNext/Wrangler.
- Asia/Bangkok is the clinic timezone; timestamps are stored in UTC.
- UI dates display as `DD-MM-YYYY` using the Gregorian year. Database dates remain ISO `YYYY-MM-DD`.

Do not introduce Google Apps Script, Google Sheets, Firebase, a second database, or another authentication provider unless the user explicitly changes this architecture.

## Non-negotiable prohibitions

- Do not call, embed, proxy, or depend on the legacy GAS Web App URL.
- Do not use a spreadsheet as a database, cache, queue, audit log, or configuration store.
- Do not expose the Supabase service-role key, database credentials, LINE channel secret, or other secrets to browser code.
- Do not rely on client-side role checks for authorization. Enforce access in server code and PostgreSQL RLS/policies.
- Do not treat hiding a button as access control.
- Do not calculate availability only in the browser.
- Do not release a checked-in room because its planned checkout date has passed. Only an explicit authorized checkout releases physical occupancy.
- Do not mark a checked-out room `AVAILABLE` immediately. It becomes `CLEANING`; staff must return it to `AVAILABLE`.
- Do not allow overlapping room allocations. Availability check and reservation must be atomic in one database transaction.
- Do not edit or modernize files in `legacy-v1.8.3/`.
- Do not commit `.env*`, tokens, keys, customer exports, generated uploads, caches, or build output.
- Do not log passwords, tokens, full bank details, uploaded medical documents, or unnecessary personal information.
- Do not perform destructive Git, database, or filesystem operations without explicit authorization and a verified target.

## Architecture boundaries

Keep these concerns separate:

- `app/` and UI components: rendering and user interaction.
- `features/`: feature-specific orchestration and validation.
- `domain/`: status transitions, pricing, capacity, and booking rules without framework dependencies.
- `data/`: repositories, Supabase queries, and database procedure clients.
- `integrations/`: LINE, storage, printing/export, and future external systems.
- Database functions/triggers: atomic allocation, code generation, state integrity, and audit facts.

Do not create speculative generic frameworks. Add extension points only where required for future POS, employee attendance, medical records, and multi-tenant SaaS integration.

## Multi-tenant and authorization rules

- Every tenant-owned row must contain `tenant_id` or be reachable through an enforced tenant-owned parent.
- Clinic users have tenant roles: `OWNER`, `DOCTOR`, `STAFF`.
- Platform roles are separate from clinic membership.
- Temporary support access requires an explicit grant with tenant, reason, scope, approver, start time, expiry time, revocation fields, and audit trail.
- Queries must never accept an arbitrary tenant identifier as sufficient authority.
- RLS must be enabled on every exposed tenant table before the table is used by the application.
- Public booking endpoints use narrowly scoped server actions/routes with validation, rate limiting, and audited writes.

## Data and business integrity

- Use UUID primary keys internally. Human-readable booking and receipt numbers are separate unique fields.
- Generate booking codes and suffixes atomically in PostgreSQL.
- Preserve money as integer satang or fixed `numeric`, never floating point.
- Store receipt snapshots and receipt line items immutably. Corrections use void/reissue, not in-place rewriting.
- Status transitions are allowlisted and enforced server-side.
- Use row locks or transactional database functions for booking, room assignment, check-in, checkout, payment verification, expiry, and rescheduling.
- Audit all privileged changes, including actor, tenant, action, entity, before/after summary, timestamp, and support grant when applicable.
- Background notifications use an outbox/idempotency design so retries do not duplicate effects.

## Product quality

- Thai is the primary UI language; code identifiers and database names use clear English.
- Support desktop, iPad/tablet, and smartphone layouts.
- Use semantic HTML, keyboard navigation, visible focus, meaningful labels, readable contrast, and minimum practical touch targets.
- Include loading, empty, success, validation, conflict, unauthorized, and recoverable error states.
- Never show raw enum values such as `NOT_REQUIRED` directly to users; map them to Thai labels.
- Do not make color the only status indicator. Include text and an icon/badge.
- Follow the approved dark-green visual system in `docs/UI_UX_SPEC.md`.

## Testing requirements

Add tests at the lowest practical layer and cover at minimum:

- pricing and animal capacity rules;
- all permitted and rejected state transitions;
- atomic overlap prevention and concurrent reservation attempts;
- checked-in rooms remaining occupied until explicit checkout;
- room filtering by species;
- LINE deposit deadline and expiry;
- one-time rescheduling and three-day notice;
- role and tenant isolation boundaries;
- temporary support access expiry/revocation;
- receipt totals, immutable snapshots, and numbering;
- date formatting and Asia/Bangkok boundaries;
- responsive critical flows.

Before reporting completion, run formatting, lint, type checking, unit/integration tests, migration checks, and production builds for both Next.js and Cloudflare. State exactly what could not be run.

## Working method

- Inspect the repository and current worktree before editing.
- Preserve unrelated and user-authored changes.
- Prefer small vertical slices that leave the application runnable.
- Create and review migrations before building UI that depends on them.
- Keep documentation synchronized with behavior.
- When a requirement changes, update the relevant document and add a dated entry to `docs/DECISIONS.md`.
- Ask before decisions that materially change price, booking capacity, privacy, authentication, data migration, or recurring cost.

## Definition of done

A task is complete only when requested behavior is implemented, authorization is enforced on the server, relevant tests pass, migrations and setup documentation are current, no secrets or customer data are committed, responsive/accessibility states are covered, and known limitations are reported.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
