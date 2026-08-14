# RBAC and Security

## Current capability model (supersedes the legacy three-role matrix below)

| Role | Baseline |
|---|---|
| `OWNER` | Every tenant capability; protects the final active OWNER and may manage all memberships |
| `ADMIN` | Every tenant capability, but may not create, promote, suspend, revoke, or change an OWNER |
| `DOCTOR` | Customer/patient, booking/check-in/out, room state, sterilization and health workflows |
| `STAFF` | Customer/patient, booking/check-in/out, room state, sterilization, collection/verification and receipts |
| `COUNTER` | Customer/patient, booking/check-in/out, sterilization and front-desk finance |
| `ASSISTANT` | Customer/patient, booking reads/check-in, room state, sterilization and health workflows |

Non-owner baselines are defaults, not hard-coded identities. OWNER/ADMIN may select explicit per-user capabilities at invitation or edit time. The capability catalog separates registry, health, booking, check-in, check-out, room state/inventory, sterilization, finance, refund, receipt, settings, users and audit access.

Enforce capabilities in shared authorization functions, security-definer RPC entry points, RLS, and private Storage policies. UI visibility mirrors the effective capability result but is not the enforcement layer. Renamed legacy function implementations are not executable by API roles.

## Legacy baseline matrix (historical)

| Capability | Owner | Doctor | Staff |
|---|:---:|:---:|:---:|
| View/create/update boarding bookings | ✓ | ✓ | ✓ |
| Assign room and check in/out | ✓ | ✓ | ✓ |
| View health fields and perform health review | ✓ | ✓ | limited as approved |
| Verify payments and add charges | ✓ | as policy permits | ✓ |
| Process/approve refunds | ✓ | — | — |
| Manage room operational states | ✓ | ✓ | ✓ |
| Add or retire room inventory | ✓ | — | — |
| Manage sterilization appointments | ✓ | ✓ | ✓ |
| Manage sterilization holidays | ✓ | ✓ | — |
| Manage clinic users and roles | ✓ | — | — |
| Manage sensitive tenant settings | ✓ | — | — |
| View tenant audit log | ✓ | limited if explicitly granted | — |

This table describes the original three-role baseline only. The current six-role capability model above is authoritative.

## Platform Owner

Platform Owner can manage tenant lifecycle, plan/feature flags, system health, and support grants. Platform Owner does not receive unrestricted tenant-record browsing by default. Any customer-data access must occur through an auditable support grant or explicit incident procedure.

## Temporary Support Access

Required fields:

- tenant;
- support user;
- requested/approved by;
- reason and ticket/reference;
- permission scope;
- start and expiry;
- status;
- revoked by/at/reason;
- last used at.

Rules:

- short default duration;
- no indefinite grant;
- immediate revocation;
- server and RLS check the grant on every relevant operation;
- prominent support-session banner;
- all support reads/mutations include grant ID in audit;
- destructive, refund, role, and secret-management actions remain excluded unless separately approved.

## Authentication

- Use Supabase Auth; do not migrate legacy password hashes.
- Invite existing users or force password setup.
- Secure, HTTP-only server session handling where applicable.
- Rate-limit login and public booking endpoints.
- Require recent authentication for sensitive owner actions when feasible.
- Never reveal whether an arbitrary phone/email has an account beyond necessary UX.

## RLS principles

- Enable RLS before exposing tables.
- Membership must be active and tenant match must be derived from authenticated identity.
- Never accept `tenant_id` by itself as authority; capability checks derive the active membership from `auth.uid()`.
- Per-user deny overrides must also block direct PostgREST/RPC/Storage calls, not only Next.js actions.
- ADMIN cannot manage OWNER even when bypassing UI controls, and users cannot change their own membership from the management action.
- Public/anonymous users receive no direct broad table reads.
- Storage policies use tenant/entity ownership and purpose.
- Service-role functions must validate actor/tenant/scope explicitly because service role bypasses RLS.

## Privacy and logging

- Collect only necessary customer/pet data.
- Mask bank account information in normal UI and logs.
- Use signed storage URLs with short expiry.
- Audit privileged access without copying sensitive document contents.
- Define retention for uploads, cancelled requests, audit, receipts, and backups before production.
- Provide tenant-level export and deletion/anonymization procedures subject to financial/audit retention requirements.

## Secure integration

- LINE webhook signature verification is mandatory.
- Store LINE tokens/secrets in Cloudflare/Supabase secrets, never database settings returned to clients.
- Validate redirects and callback origins.
- Add CSRF/origin protection where relevant.
- Validate all uploads by actual content/type where practical, not filename alone.
