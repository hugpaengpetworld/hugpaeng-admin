# Decisions Log

## 2026-08-05 — Replace the temporary Google architecture

- Decision: rebuild with Next.js, Supabase, and Cloudflare Workers.
- Supersedes: Google Apps Script backend, Google Sheets database, GAS gateway URL/key.
- Reason: performance, concurrency, security boundaries, maintainability, and future SaaS integration.

## 2026-08-05 — Date standard

- Decision: display `DD-MM-YYYY` with Gregorian year; persist/API use ISO and UTC timestamps.
- Reason: consistent presentation without locale-dependent parsing.

## 2026-08-05 — Room codes

- Decision: `CAT01–CAT11` and `DOG01–DOG07` in the new database and UI.
- Legacy import maps C/D codes and preserves originals for traceability.

## 2026-08-11 — Expandable room inventory

- Decision: `CAT01–CAT11` and `DOG01–DOG07` remain the initial inventory, but they are no longer hard maximums.
- Only an active tenant `OWNER` may add a room. PostgreSQL serializes creation per tenant/species, assigns the next `CATxx` or `DOGxx` code, and writes `ROOM_CREATED` to the audit log.
- Adding inventory does not change the two-animal room capacity, species/weight rules, or pricing.
- The sterilization schedule is shown as a Sunday-first monthly calendar. Dates remain Gregorian and stored/displayed according to the existing Asia/Bangkok rules.

## 2026-08-12 — Direct card booking and quick animal details

- Decision: an available room card opens the back-office boarding form with its room, species, and viewed date preselected. A sterilization day card opens the appointment form with its date preselected.
- A nested booked-animal button takes precedence over the surrounding card action and opens a read-only quick-detail modal for authorized clinic users.
- The modal shows only facts already stored and available under the caller's tenant/RLS scope. Missing boarding sex or breed remains explicitly unrecorded; the interface never invents those facts or weakens health-profile access.
- Non-available rooms retain their operational/detail action so the interface cannot suggest an overlapping reservation for a blocked room.
- Reason: reduce staff lookup time while preserving atomic availability checks, tenant isolation, and least-privilege access.

## 2026-08-05 — Physical occupancy is explicit

- Decision: an open `room_stay` is the source of truth for physical occupancy.
- Planned checkout date never auto-releases a checked-in room.
- Checkout closes the stay and moves room to cleaning.

## 2026-08-05 — Multi-room data shape

- Decision: owner/request group entered once; one booking unit per room; pets assigned per unit.
- Reason: supports multiple rooms without comma-separated pet data or duplicated owner records.

## 2026-08-05 — SaaS foundation

- Decision: tenant isolation is implemented from the first migration; Platform Owner and temporary Support Access remain separate from clinic roles.

## 2026-08-05 — Separate pet health access

- Decision: store vaccination and flea/tick facts separately from operational pet identity.
- Reason: staff needs pet names/species for booking operations, while health access is limited and must default to owner/doctor until a narrower staff permission is explicitly approved.

## 2026-08-05 — LINE deposit belongs to the booking group

- Decision: charge one 500 THB deposit per LINE booking group, regardless of the number of room/booking units in that group.
- Supersedes: the temporary Phase 3–4 implementation that created one 500 THB payment fact per booking unit.
- Reason: explicit clinic confirmation; multi-room requests are one customer booking group and must not multiply the deposit.

## 2026-08-05 — Check-in deposit represents the total held

- Decision: the check-in field records the total verified/manual deposit held for one booking unit, matching legacy behavior.
- The value cannot be lower than an already verified deposit. Any larger value replaces the unit's verified total instead of creating a duplicate amount.
- Reason: prevents double counting a LINE deposit when staff confirms the actual amount at check-in.

## Pending — Conservative Phase 6 finance authorization

- Temporary implementation: `OWNER` alone may record refunds, void receipts, or void-and-reissue receipts.
- `OWNER` and `STAFF` may record the normalized incoming account identity used later for refund matching; `DOCTOR` cannot.
- Reason: this is the least-privilege interpretation of the current RBAC matrix and accepted legacy permissions.
- Impact: confirm the permanent doctor/staff cancellation, adjustment, void, and reissue matrix before production. The temporary implementation is intentionally reversible.

## 2026-08-05 — Receipt clinic identity excludes tax fields

- Initial decision: receipt headers display the clinic address and telephone number only.
- Superseded by the later 2026-08-05 decision below, which permits explicitly configured tax identity.

## 2026-08-05 — Optional owner-configured receipt tax identity

- Decision: address and telephone remain the default receipt identity. An OWNER may explicitly enable and configure a tax-information heading, tax identification number, and branch number in Settings.
- Disabled or unconfigured tax identity must not render on receipts. Enabled values are copied into the immutable receipt snapshot and later Settings changes do not rewrite issued receipts.
- Reason: explicit clinic clarification after the initial no-tax-fields decision.

## 2026-08-05 — Combined booking-group receipt and settlement

- Decision: issue one combined receipt for the booking group after its final active room unit checks out and subtract the 500 THB group deposit once.
- Earlier room-unit checkouts close physical stays and move those rooms to cleaning immediately, but do not collect final group payment or issue a partial receipt.
- Reason: explicit clinic confirmation; this preserves independent physical room release without duplicating the shared deposit.

## 2026-08-05 — Temporary Support Access foundation is read-only and explicitly timed

- Decision: support grants require a tenant, Support Agent, ticket/reference, reason, explicit read scopes, start, expiry, approver, and audit linkage.
- No grant contains write, refund, role-management, or secret-management scope. Every grant is capped at 24 hours and can be revoked immediately.
- No default duration is selected in the product; Platform Owner must choose a duration for each grant until the clinic confirms its operating policy.
- Reason: least privilege while keeping the unresolved default duration reversible before production.

## 2026-08-05 — User provisioning and first-owner bootstrap are transactional

- Decision: an authenticated clinic `OWNER` may create a tenant membership only through `provision_tenant_member(...)`, which writes the profile, membership, and audit fact in one database transaction.
- The service-only `bootstrap_first_tenant_owner(...)` function is idempotent for the same user, refuses to replace another active owner, and records the initial-owner audit fact.
- Anonymous clients have no direct `EXECUTE` privilege on security-definer functions; RLS predicates grant only the minimum authenticated execution they require.
- Reason: prevent partially provisioned or unaudited privileged access and remove inherited PostgreSQL `PUBLIC` function privileges.

## 2026-08-12 — Audited staff rate and atomic room-card direct check-in

- Decision: 150 THB for one animal and 200 THB for two animals remain the public/default nightly rates. An authenticated clinic `OWNER`, `DOCTOR`, or `STAFF` may quote a positive custom nightly rate for each back-office room unit; PostgreSQL stores integer satang, recalculates the lodging total, and audits the quote against the standard rate.
- Decision: the general back-office form retains `สร้างคำขอจอง`. A form opened from an available room card also offers `เช็คอินทันที`, which atomically creates the group, confirms every unit, reserves every room, and opens every physical stay using the existing allowlisted transitions.
- Decision: direct LINE check-in requires at least the single 500 THB booking-group deposit. Other channels may record zero or a manually received group deposit. Multi-room failures roll back completely and retries are idempotent.
- Supersedes: the fixed-rate database constraint for every back-office booking and the need to visit a second approval/check-in screen for a walk-in already at an available room.
- Reason: the clinic gives repeat/long-stay customer discounts and needs a shorter counter workflow without weakening price traceability, room-overlap safety, tenant authorization, or group-deposit rules.

## 2026-08-12 — Occupied-room details and checkout shortcut

- Decision: occupied cat/dog room cards show recorded owner/contact, pet, payment, stay, and note facts and provide a `เช็คเอาท์` shortcut in the room modal.
- The shortcut reuses `check_out_booking(...)` and the existing charge/settlement confirmation. It does not create a second checkout path or bypass tenant roles, optimistic version checks, idempotency, early-checkout confirmation, booking-group deposit/receipt rules, audit facts, or the room-to-`CLEANING` transition.
- The `เช็กอิน–เช็กเอาต์` navigation item remains available for now; removing it is a future navigation decision after all operational state actions are reachable and verified from room screens.
- Reason: reduce counter steps while keeping one authoritative financial and physical-occupancy workflow.

## 2026-08-13 — Repeatable structured checkout charges

- Decision: room checkout uses repeatable charge rows with one approved category and positive THB amount per row. The catalog contains food, medicine, IV fluids, blood test, flea/tick treatment or prevention, five specified vaccine categories, medical service, and other.
- `อื่น ๆ` requires a staff-entered description. Named catalog categories are persisted as PostgreSQL enum facts and retain a readable Thai receipt description; money remains integer satang.
- Payment method and checkout/receipt notes are unchanged. The server temporarily accepts the earlier fixed-field checkout form so the existing operational screen remains functional while the room shortcut adopts the new rows.
- Reason: a stay may have several distinct medical and service charges, and the receipt/audit trail must not collapse them into one generic amount.

## 2026-08-13 — Veterinary-service charge label

- Decision: the Thai display and receipt label for `MEDICAL_SERVICE` is `ค่าบริการทางสัตวแพทย์`, replacing `ค่าบริการทางการแพทย์`.
- The stored enum identifier remains `MEDICAL_SERVICE`; no data migration or financial-history rewrite is required.
- Reason: use terminology appropriate to the veterinary clinic.

## 2026-08-13 — Atomic check-in from held room cards

- Decision: held/pending and confirmed cat/dog room cards provide a `เช็คอิน` action alongside the unchanged room-state cancel/save controls. A confirmation step records the actual booking-group deposit and optional check-in note before opening physical occupancy.
- PostgreSQL atomically advances an eligible `PENDING_APPROVAL` or `APPROVED_AWAITING_DEPOSIT` unit through `CONFIRMED` to `CHECKED_IN`, retains optimistic-version and idempotency checks, locks the room, and rolls back the approval if check-in fails. Already confirmed units reuse the same path.
- LINE requires at least the single 500 THB booking-group deposit; the function does not create a per-room deposit. `OWNER`, `DOCTOR`, and `STAFF` retain the existing check-in permission and all transitions remain audited.
- Reason: staff need one room-screen workflow for counter and online bookings without losing deposit, authorization, overlap, or physical-occupancy guarantees.

Add future decisions with date, decision, superseded behavior, and reason. Never rewrite history silently.

## 2026-08-13 — Canonical public and back-office URLs

- Decision: `https://hug-paeng.com/` remains the customer-facing website. Clinic users sign in at `/admin/login`, and a successful sign-in lands on `/admin`, the canonical back-office home. A redundant `/admin/home` route is not introduced.
- Decision: the back-office shell remains available only to active tenant members with `OWNER`, `DOCTOR`, or `STAFF` roles. Server authorization and PostgreSQL RLS remain authoritative regardless of route or menu visibility.
- Supersedes: `/login` as the primary user-facing clinic login URL. The old route remains a compatibility redirect so saved links do not fail.
- Reason: establish a stable URL boundary before HUG-PAENG grows into one customer website and one role-controlled Full Option administration system.

## 2026-08-13 — Future Full Option and Excel reporting direction

- Decision: future planning includes employee attendance, POS, the current boarding/sterilization system, a business overview, and role-controlled Excel reports in the same tenant-aware back-office product.
- This is recorded future scope only. It does not authorize accounting, payroll, POS, medical-record, or broad customer-export implementation during the current Phase 9 release.
- Recommended report domains and export safeguards are recorded in `docs/FULL_OPTION_ROADMAP.md`.
- Reason: preserve the intended product architecture without delaying the first usable boarding and sterilization release or prematurely widening privacy and financial scope.

## 2026-08-13 — Exact-amount Dynamic PromptPay before receipt issuance

- Decision: an OWNER may configure and enable a validated PromptPay target and expected payee name. At the final booking-group checkout, staff can generate a new Thai QR Payment payload containing the exact server-recalculated positive amount due after all charges and the one group deposit.
- Decision: staff must compare the recipient and amount shown by the banking application and explicitly confirm funds arrived. PostgreSQL rejects PromptPay settlement when the confirmation is absent or the quoted amount differs from the transactionally recalculated amount.
- Dynamic QR is not displayed for an earlier room checkout, zero balance, refund-due balance, or an issued paid receipt. Receipt creation remains after verified settlement and does not include a collection QR.
- Supersedes: using the free-text LINE-deposit PromptPay display value as though it were sufficient to create checkout QR payloads.
- Reason: reduce counter entry errors and make the scanned amount exact without creating duplicate-payment risk on paid receipts.

## 2026-08-13 — Audited room retirement instead of hard deletion

- Decision: cat and dog room pages provide an `OWNER`-only remove control, but the database soft-retires the selected room instead of deleting its row.
- Retirement requires an explicit reason, sets the room to `DISABLED`, removes it from active planning, increments its optimistic version, and writes `ROOM_RETIRED` to the tenant audit log. Sequential room codes include retired rows, so a removed code is never reused.
- PostgreSQL rejects retirement when the room has an open physical stay or an active `HOLD`/`RESERVED` allocation. Existing booking, stay, receipt, and audit history retains the original room reference.
- Reason: the clinic needs to reduce physical inventory without corrupting historical operations, financial snapshots, or room-capacity guarantees.

## 2026-08-13 — Responsive back-office portal home

- Decision: `/admin` is a dedicated full-screen HUGPAENG module launcher with responsive smartphone, tablet, and PC artwork and a top navigation bar. The booking sidebar is hidden only on the exact portal route and remains on operational module routes.
- Decision: the initial portal labels are `ระบบ POS`, `ฝากเลี้ยง–ทำหมัน`, `สำหรับพนักงาน`, and `ศูนย์งานสัตวแพทย์`. `ศูนย์งานสัตวแพทย์` is the future umbrella for blood-analyzer results, referral documents, and other authorized clinical tools.
- Only the existing boarding/sterilization area is linked in this release. Future modules are visibly marked `เร็ว ๆ นี้` without speculative routes or authorization shortcuts.
- Supersedes: presenting the booking operations dashboard and its sidebar as the canonical `/admin` home.
- Reason: the long-term Full Option product needs a neutral back-office entrance distinct from both the public customer website and each internal operational module.

## 2026-08-14 — Tenant-neutral SaaS portal and centralized owner settings

- Decision: remove hard-coded `HUGPAENG`/`ฮักแพง` identity from user-facing administration and authentication screens. The portal header uses the current tenant's configured names and logo, with a neutral fallback when no logo exists.
- Decision: rename `ศูนย์งานสัตวแพทย์` to `สำหรับสัตวแพทย์` and add `การตั้งค่าสำหรับผู้ดูแลระบบ` to the portal for OWNER only.
- Decision: tenant identity, contact, logo, receipt/tax, PromptPay, and future shared settings remain at `/admin/settings`. Remove the duplicate Settings entry from the boarding/sterilization sidebar and account popup. `requireOwner(...)` remains mandatory on the settings page and mutation.
- Decision: keep tenant identity in the first portal-header row and move system navigation plus the signed-in account to a second row. Remove the duplicate portal card grid so the header navigation is the single system switcher.
- Decision: centralize user invitation and membership management with OWNER settings. Remove `ผู้ใช้งาน` from the boarding/sterilization sidebar and the account popup; `/admin/settings` and `/admin/users` share the ordered controls `กลับหน้าหลักระบบหลังบ้าน`, `เพิ่มผู้ใช้งาน`, and `การตั้งค่าสำหรับผู้ดูแลระบบ` in a standalone administration layout. Page loaders and mutations continue to require OWNER authorization.
- Supersedes: the hard-coded HUGPAENG portal identity, the `ศูนย์งานสัตวแพทย์` label, and the duplicate `ตั้งค่า` entry inside the boarding/sterilization module.
- Reason: the product is intended to become multi-tenant SaaS, so one tenant's brand must not become product identity and shared administration must have a single authoritative entry point.

## 2026-08-14 — Version 1 starts from a clean production seed

- Decision: use `CLEAN_SEED` for Version 1. Create production from the reviewed SQL migrations and seed data, then provision real users through Supabase Auth.
- Decision: do not copy development, rehearsal, or legacy customer, pet, booking, stay, payment, receipt, audit, Auth, or uploaded evidence records into Version 1 production.
- Decision: `bmp-booking-dev` remains a staging project and must not be promoted into production. A later `LEGACY_IMPORT` requires a new explicit OWNER decision, mapping review, rehearsal, and reconciliation.
- Reason: the OWNER chose to launch Version 1 with a clean database and avoid carrying experimental or legacy operational data into the production system.

## 2026-08-14 — Six clinic roles, per-user capabilities, and patient HN

- Decision: clinic roles are `OWNER`, `ADMIN`, `DOCTOR`, `STAFF`, `COUNTER`, and `ASSISTANT`.
- Decision: OWNER and ADMIN receive every tenant capability. ADMIN may manage clinic users and permissions but must never create, promote, suspend, revoke, or otherwise manage an OWNER account; this restriction is enforced in PostgreSQL and server actions.
- Decision: OWNER/ADMIN select explicit capabilities for non-owner users. Direct table, RPC, and private Storage access must enforce the same effective capabilities as the UI.
- Decision: the central registry searches by normalized phone, owner name, pet name, or HN. Existing customers can select several existing pets and add another pet without re-entering customer data.
- Decision: every pet receives a separate immutable tenant-scoped `HN-######`; HNs are not shared and are never reused.
- Decision: Version 1 links registry identities to boarding and sterilization. Full EMR, IDEXX/device integration, IPD, treatment, inventory, POS/payroll, referrals, AI SOAP, and paperless clinical workflows remain future releases.
- Reason: launch the reliable booking/sterilization product without blocking Version 1 on the full veterinary platform, while establishing identity and authorization foundations that future modules can safely reuse.

## 2026-08-15 — Version 1 production target and operating choices

- Decision: Version 1 production uses the dedicated Supabase project `bmp-booking-production` (`dghipgebiioxphbbyvxp`) on the Free plan temporarily, Cloudflare account `dd0c01bdf56fa7bba2e915d0522a9666`, Worker `bmp-booking-production`, and canonical application URL `https://admin.hug-paeng.com`.
- Decision: LINE notifications are enabled for launch only after production channel credentials are stored as server-side Cloudflare secrets. No LINE secret or access token may be written to source control or browser code.
- Decision: OWNER and ADMIN receive the complete financial capability set. Every other role must receive each financial capability explicitly per user; role labels or hidden buttons are not authorization.
- Decision: operational records remain available for six months. Any archive, deletion, or backup lifecycle after that boundary requires a separately reviewed retention implementation that preserves medical, receipt, audit, and legal obligations; this decision does not authorize automatic destructive deletion.
- Reason: fix one auditable production target and the launch policy boundaries without coupling the release to a paid Supabase upgrade or implementing unsafe retention deletion prematurely.

## 2026-08-15 — Production support-access operating policy

- Decision: production support access is disabled by default. No production `SUPPORT_AGENT` account is provisioned until a genuine support incident requires it.
- Decision: a temporary grant requires explicit tenant OWNER approval, a reason and ticket/reference, the minimum read-only allowlisted scopes needed for the incident, and a visible start and expiry. The operating default is at most two hours; PostgreSQL continues to enforce the absolute maximum of 24 hours.
- Decision: support access never grants tenant writes, financial mutations or refunds, user/role administration, secret management, or unrestricted tenant browsing. Every grant, use, expiry, revocation, and associated read is tied to the grant in the audit trail, and the OWNER may revoke it immediately.
- Reason: permit time-bounded troubleshooting without creating permanent privileged access to customer, patient, booking, or financial data.

## 2026-08-15 — Inline registry reuse in back-office creation

- Decision: the room-planning and sterilization create forms begin with the existing tenant-scoped patient-registry search. Staff can search by phone, owner name, pet name, or HN; boarding can select several active pets belonging to one owner, while sterilization selects one pet.
- Decision: selecting a result reuses the existing customer and pet IDs. Search remains a capability-protected server action backed by PostgreSQL tenant enforcement and does not place personal search terms in the URL.
- Decision: actionable room cards, sterilization day cards, and appointment rows display the pointer cursor and open with one click, Enter, or Space. Double-click is not part of any workflow.
- Decision: the existing Version 1 direct-check-in database function does not yet accept registry-linked identities. A registry-linked booking therefore follows create request → room-card check-in, and the UI hides the unsupported direct action. Newly entered customers retain the existing atomic direct-check-in flow.
- Reason: reduce duplicate customer/pet entry immediately without bypassing tenant authorization or weakening the current transactional booking and check-in guarantees.

## 2026-08-15 — Immediate and relevance-ranked patient search

- Decision: patient-registry lookup begins automatically after a short 200 ms typing pause once at least two characters are present. The explicit search button and Enter submission remain available for keyboard and assistive-technology users.
- Decision: exact owner, pet, HN, and phone matches rank ahead of prefix matches. A name-only query must never become an empty normalized-phone prefix, and therefore must not match every customer phone.
- Decision: the current query stays visible, matching text is emphasized in each result, stale responses are not rendered for a newer query, and an empty result names the exact query that was not found.
- Decision: after `ใช้ข้อมูลที่เลือก`, the create form scrolls to the populated owner/pet section and shows the selected registry identity so the action has immediate visible feedback.
- Reason: make registry reuse fast and predictable while preventing unrelated records from obscuring the intended patient and preventing duplicate data entry.

## 2026-08-16 — Literal contains matching for patient names

- Decision: owner and pet name searches match the literal query at any position in the name. Results remain ranked as exact match, prefix match, then contains match; phone and HN keep their exact/prefix behavior.
- Decision: wildcard characters typed by a user are treated as ordinary name characters rather than SQL pattern operators.
- Supersedes: limiting owner and pet name lookup to prefix-only matches.
- Reason: a query such as `ปอย` must find `หมอปอย`, while exact and prefix matches still remain easier to find at the top and unrelated names are excluded.
