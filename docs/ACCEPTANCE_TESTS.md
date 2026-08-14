# Acceptance Tests

## Room and booking integrity

- Two concurrent requests cannot allocate the same final room capacity.
- A user with `ROOM_INVENTORY_MANAGE` can retire an unused room from cat/dog planning with a required reason; the row and historical references remain, its code is never reused, and an audit fact is written.
- STAFF/DOCTOR cannot retire inventory. Retirement is rejected for an open stay, an active `HOLD`/`RESERVED` allocation, a stale version, or an already retired room.
- Pending approval consumes capacity.
- Cat booking can select only CAT rooms; dog booking only DOG rooms.
- Checked-in CAT02 stays red/occupied after planned checkout until explicit checkout.
- Checkout sets CAT02 to cleaning; it is not available until staff marks it available.
- An open stay prevents another check-in to the same room.
- Multi-room booking stores pets against the correct room and owner once.

## Pricing and animal rules

- One cat/night = 150; two cats/night = 200.
- One dog <=20 kg/night = 150; >20 kg rejected.
- Two dogs each <=8 kg/night = 200; either >8 kg rejected.
- More than two animals in one room rejected.
- Cat weight may be empty; dog weight may not.
- Day-care rounding and >3-hour cap match the specification.
- Back-office staff can quote a positive custom nightly rate per room; the stored satang rate and total equal quoted rate × nights and the quote is audited against the default.
- Zero, malformed, overflow, or unaudited direct price updates are rejected.

## Workflow

- LINE approval starts one 500 THB requirement with a one-hour deadline for the whole booking group.
- A multi-room LINE booking group creates exactly one 500 THB deposit fact; room count does not multiply the required deposit.
- Non-LINE approval does not require deposit by default.
- Expiry runs twice but releases/sends only once.
- One reschedule succeeds when >=3 days and capacity exists.
- Second or late reschedule is rejected without changing original allocation.
- Cancellation forfeits deposit.
- Check-in/out works outside clinic hours.
- Invalid status transitions are rejected server-side.
- Room-card direct check-in creates and checks in all room units atomically; a room conflict leaves no partial group, allocation, stay, payment, or customer booking.
- Repeating a direct check-in with the same idempotency key returns the original result and does not duplicate bookings or stays.
- A multi-room direct LINE check-in requires at least 500 THB and creates exactly one booking-group deposit; 499 THB is rejected before any booking is created.

## Operational UI

- `รอเช็กอิน` is not today-only and has the required columns.
- `กำลังเข้าพัก/รอเช็กเอาท์` contains all open stays and due/overdue rows.
- Both lists filter cat/dog and show `pet(species)`.
- Room dropdown is same-species and period-valid; no separate assign button exists.
- Dates display as `DD-MM-YYYY` on every relevant page.
- Raw enums and raw errors are never shown.
- Only the room-card form shows `เช็คอินทันที`; the general back-office booking form continues to show the request/review workflow.
- Clicking an occupied cat/dog room shows the stored owner/contact and pet facts. Its `เช็คเอาท์` action uses the same server-authorized atomic checkout, displays the charge/group-deposit summary, requires early confirmation when applicable, issues a receipt only for the final active room in the group, and returns the room to the selected room page as `CLEANING`.
- Room checkout accepts multiple dropdown charge rows from the 12-item approved catalog, calculates every entered THB amount in integer satang, rejects incomplete/unknown/non-positive rows, and requires a description for `อื่น ๆ`; receipt items retain the selected structured category and readable Thai item name.
- Dynamic PromptPay QR contains the exact server-recalculated positive final amount after group charges and the one group deposit. Changing a charge invalidates the prior quote.
- PromptPay checkout is rejected unless staff confirms funds received and the quoted amount equals the amount recalculated transactionally. QR is absent for non-final, zero, refund-due, and already-paid receipt states.

## Sterilization

- 0–3 active appointments display green.
- Exactly 4 displays red/full.
- Fifth requires authorized acknowledgement and displays purple.
- Staff/doctor/owner can create; public customer cannot.
- Other species reveals required custom field; sex accepts male/female only.
- Age and vaccination appear in create/detail/list as specified.

## Receipts

- Daily receipt sequence is unique under concurrency.
- Header total equals item sum.
- Issued snapshot does not change when current customer/pet data changes.
- Void requires reason and reissue creates a new number.
- Artifact generation failure does not undo checkout or room-to-cleaning.
- 80 mm print view is legible in browser print preview.
- A two-room booking group produces one combined receipt only after the final active room checkout and subtracts the 500 THB group deposit exactly once.
- Receipt header snapshots address and phone; tax heading, tax ID, and branch number are absent by default.
- When an OWNER enables and configures receipt tax identity, the issued snapshot and print view show exactly those configured values; later Settings changes do not rewrite it.

## Security

- Tenant A cannot read or mutate Tenant B through UI, server endpoints, direct Supabase client, or storage path.
- Staff cannot manage users/settings/refunds.
- Doctor cannot obtain owner privileges.
- Anonymous public requests cannot list bookings/customers/rooms exactly.
- Service-role key is absent from client bundle.
- Expired/revoked support grant fails immediately.
- Support actions contain grant ID in audit.
- LINE invalid signatures are rejected.

## Responsive/accessibility

- Critical public and admin flows pass desktop, iPad/tablet, and representative smartphone viewport checks.
- Keyboard-only user can navigate, open/close modal, choose room, and submit.
- Focus returns after modal close.
- Status remains understandable without color.
- Loading, empty, validation, success, conflict, and unauthorized states are present.

## Patient registry and capabilities

- Searching another tenant's registry fails through RLS and RPC even when a caller submits that tenant UUID directly.
- Every newly created pet receives a different tenant-scoped HN, and updating an issued HN fails.
- Concurrent new-customer requests using the same tenant/phone produce one registry customer.
- A non-owner user's explicit deny blocks both the Next.js action and direct authenticated RPC/table/Storage access.
- ADMIN can manage non-owner roles and capabilities but cannot create, promote, suspend, revoke, or edit OWNER.
- One customer can select multiple existing pets for a workflow and can add another pet without duplicating customer data.

## Release checks

- Formatter, lint, strict typecheck, unit/integration/E2E tests pass.
- Supabase migrations apply from empty and upgrade staging.
- Next.js production build and Cloudflare Worker build pass.
- No committed secrets, live customer exports, or legacy credentials.
- Backup restore and migration reconciliation documented.
