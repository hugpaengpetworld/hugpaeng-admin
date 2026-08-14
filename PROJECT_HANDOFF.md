# PROJECT_HANDOFF.md

## 1. Purpose

This repository handoff defines the rebuild of the temporary BMP Booking system for **คลินิกบ้านหมอปอยรักษาสัตว์ / Baan Mhor Poy Vet Clinic**.

The latest legacy reference is **BMP Booking GAS v1.8.3**. It used Google Apps Script, Google Sheets, and a Cloudflare Worker gateway. The new system must preserve accepted product behavior but must be rebuilt as a normal database-backed web application.

### Mandatory architectural change

The new system must not use:

- Google Apps Script;
- Google Sheets as a database;
- the old GAS API URL or gateway key;
- spreadsheet row numbers or column positions as application identity;
- the old Cloudflare-to-GAS proxy.

The selected replacement is:

- Next.js App Router, strict TypeScript, Tailwind CSS;
- Supabase PostgreSQL, Auth, and Storage;
- Cloudflare Workers via OpenNext/Wrangler;
- SQL migrations, RLS, transactional database functions, and automated tests.

The public target domain remains `bmpbooking.hug-paeng.com` unless the user changes it.

## 2. Source of truth and precedence

1. This handoff and the current files under `docs/` are authoritative.
2. Latest explicit requirements in this document override older behavior.
3. `legacy-v1.8.3/` is for behavior comparison only.
4. Never copy the legacy persistence, password, session, API gateway, or spreadsheet access approach into the new system.

## 3. Product scope

### Current clinic MVP

- Public cat/dog overnight boarding request.
- Staff back office for all booking channels.
- Room planning, room assignment, check-in, checkout, cleaning, and maintenance.
- Customers and per-animal records.
- LINE-only deposit workflow and automatic expiry.
- Charges, checkout totals, receipts, and 80 mm browser printing.
- Staff-managed sterilization appointment calendar.
- Clinic roles: owner, doctor, and staff.
- Thai responsive interface for desktop, tablet/iPad, and smartphone.

### Foundation required now, features delivered later

- Multi-tenant SaaS foundation.
- Platform Owner console.
- Temporary Support Access.
- Integration boundaries for POS, employee attendance, medical/diagnostic records, and other clinic modules.

These future modules must not be implemented speculatively during parity work, but the identity, tenant, customer, pet, audit, and integration boundaries must not block them.

## 4. Latest product decisions that override legacy behavior

- Check-in and checkout may be performed at any time. Do not enforce clinic opening hours or Thursday appointment windows.
- Initial cat room IDs are `CAT01`–`CAT11`; an `OWNER` may add rooms and the system assigns the next sequential `CATxx` code atomically.
- Initial dog room IDs are `DOG01`–`DOG07`; an `OWNER` may add rooms and the system assigns the next sequential `DOGxx` code atomically.
- The physical occupancy of a checked-in room continues until an authorized user explicitly checks out the booking. Planned checkout date alone never makes the room available.
- Checkout changes the room to `CLEANING`, not directly to `AVAILABLE`.
- “รอเช็กอินวันนี้” becomes **“รอเช็กอิน”** and displays all relevant waiting bookings, not only today's.
- “กำลังเข้าพัก” and “รอเช็กเอาต์วันนี้” become one view: **“กำลังเข้าพัก/รอเช็กเอาท์”**, showing all active stays and checkout-due/overdue stays without a today-only filter.
- Both operational lists use columns: `รหัสการจอง | เจ้าของ | ชื่อสัตว์เลี้ยง | ห้องพัก | วันเข้า | วันออก`.
- Both operational lists include cat/dog filter controls above the table.
- Pet labels display as `ชื่อ(ชนิดสัตว์)`, for example `ชาไทย(แมว)`.
- Room assignment is an in-modal dropdown filtered to the booking species and rooms that can accept the booking. Remove the separate “กำหนดห้อง” button.
- All displayed dates use `DD-MM-YYYY` consistently with a Gregorian year. Native inputs and APIs may use ISO internally.

## 5. Clinic and branding

- Thai name: `คลินิกบ้านหมอปอยรักษาสัตว์`
- English name: `Baan Mhor Poy Vet Clinic`
- Primary timezone: `Asia/Bangkok`
- Currency: `THB`
- Primary theme: dark green left navigation with white text/icons; lighter green top bar; dark-green text; clean white content surfaces.
- Approved room status colors:
  - available: `#C8EAD1`;
  - pending room approval: `#F7D081`;
  - confirmed or physically occupied: `#FD464A`;
  - cleaning/maintenance/disabled: neutral gray.
- Status must always have text and/or an icon in addition to color.
- Clinic logo and Thai/English clinic names are editable settings with validated image upload.

## 6. Boarding rules

### Rooms and nightly price

| Species | Rooms | One animal | Two compatible animals | Limits |
|---|---:|---:|---:|---|
| Cat | CAT01–CAT11 initially; OWNER-expandable | 150 THB/night | 200 THB/night | Maximum two; no weight limit |
| Dog | DOG01–DOG07 initially; OWNER-expandable | 150 THB/night | 200 THB/night | One dog maximum 20 kg; for two dogs, each dog must be at most 8 kg |

- A room accepts at most two animals.
- Two animals must belong to the same household and be able to stay together.
- The table rates remain the public/default rates. An authenticated `OWNER`, `DOCTOR`, or `STAFF` back-office booking may quote a positive custom nightly rate for each room unit; the quoted rate and calculated lodging total are stored in integer satang and audited against the standard rate.
- Pricing rules must live in the domain layer and have automated tests.

### Day care and emergency own-cage service

- Same-day care is 50 THB per billable hour.
- More than three hours costs 150 THB.
- Minute rounding: up to and including 30 minutes rounds down; more than 30 minutes rounds up.
- Owner-provided cage is free when the clinic accepts it.
- A dog over 8 kg must use a clinic dog room.
- Emergency own-cage service is staff-only, accepted only via phone/walk-in for exceptional circumstances, and does not allocate `CATxx` or `DOGxx` capacity.
- Public web/LINE self-service must not expose day care or emergency own-cage service.

## 7. Booking channels and deposits

Channels: website, LINE, Facebook, phone, walk-in, and other.

- Public self-booking accepts overnight boarding requests only.
- A submitted request holds capacity in `PENDING_APPROVAL` so two customers cannot take the same room capacity.
- The public interface displays only available counts; staff assigns a specific room later.
- A LINE booking requires one 500 THB deposit per booking group after approval, regardless of the number of room units in that group.
- Other booking channels do not require a deposit by default; authorized staff may record a manually received deposit.
- After approval, a LINE customer has one hour to pay.
- When the deadline passes without verified payment, the request expires atomically, held capacity is released, and a LINE notification is queued.
- Other-channel customer communication is handled manually by staff.
- PromptPay QR and bank account details are tenant settings. Secrets and full sensitive account data are never exposed beyond what is required for payment instructions.

## 8. Cancellation and rescheduling

- A cancelled booking forfeits the deposit; there is no cancellation refund.
- One reschedule is allowed.
- Customer must request it at least three days before check-in.
- New dates must have capacity.
- Website rescheduling verifies booking code plus the booking phone number.
- Phone/walk-in/other-channel rescheduling is handled by authorized staff.
- If a refund is legitimately due, it can be transferred only to an account whose name and number match the original incoming transfer. Record masked account data and verification evidence.

## 9. Health information

- Vaccination evidence upload is optional.
- Collect flea/tick treatment questions and dates/products when available.
- The system accepts the request first and flags it for staff health review where required.
- Do not collect an emergency contact.
- Do not collect a behavior field unless the user later explicitly adds it.

## 10. Back-office booking form

- Staff first selects the number of rooms required.
- Owner/customer information is entered once for the whole booking group.
- Each room has its own species, animal count, animal names, and weights.
- One animal shows one name/weight pair; two animals show two separate pairs.
- Cat weight is optional.
- Dog weight is required and validated against the one-dog/two-dog rules.
- Multi-room bookings keep animal-to-room assignments explicit.
- Each room unit includes an editable `ค่าห้องพัก/คืน (บาท)` field, defaulting to 150 THB for one animal and 200 THB for two animals.
- The standard `สร้างคำขอจอง` action retains the review workflow. A form opened from an available cat/dog room card additionally offers `เช็คอินทันที`.
- Direct check-in atomically creates the booking group, stores every quoted room rate, confirms all units, reserves their rooms, and opens every physical stay. A failure in any unit rolls back the whole group.
- A direct LINE check-in requires at least the single 500 THB booking-group deposit; other channels may record zero or a manually received group deposit.

## 11. Room planning and the C02 class of defect

The legacy screen could display a checked-in room as available because its view combined planned dates and a stale room status. This is unacceptable.

The new system uses two related concepts:

1. **Planned allocation** — holds/reservations for a date range.
2. **Physical stay** — a check-in record with `checked_in_at` and no `checked_out_at`.

Rules:

- One room may have at most one open physical stay.
- An open physical stay always renders the room red as `กำลังเข้าพัก`, regardless of planned checkout date.
- Only checkout closes the stay.
- Checkout changes the room operational status to `CLEANING`.
- Staff explicitly changes `CLEANING` to `AVAILABLE` after cleaning.
- Concurrent assignment/check-in operations lock the room row and are rejected on conflict.
- Future allocation screens must warn if an overstaying physical stay conflicts with a future reservation.

## 12. Check-in and checkout

### Waiting check-in view

- Title: `รอเช็กอิน`.
- Show all confirmed/eligible bookings that have not checked in or completed/cancelled, including future rows as product filters permit; do not hard-code “today only”.
- Columns: booking code, owner, pet name(s), room, check-in date, checkout date.
- Cat/dog filter controls above the list.
- Room dropdown displays only same-species rooms that are valid for the planned period.
- Check-in collects a manually entered deposit amount and an optional note, including food brought, food purchased, selected but unpaid food, or other operational notes.
- Check-in is allowed at any time.

### Active/checkout view

- Title: `กำลังเข้าพัก/รอเช็กเอาท์`.
- Combine all open stays and checkout-due/overdue stays; never filter to today only.
- Use the same columns and cat/dog filters as the waiting view.
- Early checkout requires confirmation and a server-side repeat check.
- Checkout summary contains lodging, additional expenses, deposit, amount due, and refund difference.
- Additional expense types: food, medicine, IV fluids, blood test, flea/tick treatment or prevention, cat combination vaccine, cat leukemia (FeLV) vaccine, dog combination vaccine, dog six-disease combination vaccine, rabies vaccine, veterinary service (`ค่าบริการทางสัตวแพทย์`), and other. Staff adds one or more item rows, each with its own amount; selecting other requires a description.
- Checkout is allowed at any time.

## 13. Room user interface

- Separate navigation items: `ห้องพักแมว` and `ห้องพักสุนัข`.
- Each room screen provides an `OWNER`-only add-room control; room codes are generated sequentially in PostgreSQL and every creation is audited.
- Each room screen also provides an `OWNER`-only remove-room control. Removal is an audited retirement, not a physical delete: the room is hidden from active planning, its historical booking/stay references remain intact, and PostgreSQL rejects retirement while an open stay or active `HOLD`/`RESERVED` allocation exists.
- Each screen has previous day, today, selected date, and next day controls and supports future dates.
- Cards are clickable.
- Available card can begin a back-office booking.
- The room-card booking form may complete an authorized direct check-in without a second approval screen; the shortcut remains server-authorized and transactionally conflict-safe.
- Pending, confirmed, and occupied cards open details.
- An occupied-room detail shows the authorized user the recorded owner/contact, pet, payment, stay, and note facts, and provides a checkout shortcut. The shortcut must use the same atomic checkout, charge, early-confirmation, booking-group settlement, receipt, audit, and room-to-`CLEANING` workflow as the operational checkout view.
- Booked cards show a cat or dog SVG icon and a pet-name badge.
- Room labels use `CATxx` and `DOGxx` everywhere, including database seed data and human-readable booking codes.

## 14. Sterilization appointments

- Staff/doctor/owner back-office only; no online public booking.
- Normal daily capacity is four animals.
- Four bookings makes the calendar card red.
- More than four makes it purple.
- Authorized staff or doctor may overbook after an explicit warning.
- Species dropdown: dog, cat, other. Choosing other reveals a required custom-species field.
- Sex dropdown: male or female.
- Capture pet age and vaccination status.
- Each animal appears on the calendar as a clickable row. Preserve the current display convention unless the user changes it: cat `F-name/sex`, dog `C-name/sex`.
- Sterilization holidays can block normal scheduling, with authorized override recorded in audit when supported.

## 15. Receipts and printing

- Checkout can issue an 80 mm receipt and use browser printing for a receipt printer.
- The default receipt header displays the clinic address and telephone number only.
- Tax-information heading, tax identification number, and branch number are hidden unless an OWNER explicitly enables and configures them in clinic settings. When enabled, those configured values are copied into the immutable receipt snapshot.
- A multi-room booking group receives one combined receipt after all active room units in the group are checked out. The group receipt applies the group's 500 THB LINE deposit exactly once.
- Receipt number format: `BMP-RCP-YYYYMMDD-0001`, with atomic daily sequence.
- Receipt stores immutable customer, pet, room, stay, payment, and line-item snapshots.
- Reprint is supported.
- Corrections use void and reissue; do not rewrite issued financial history.
- Receipt generation failure must not roll back a completed checkout or room release. It must create a recoverable error and allow regeneration.
- Completed list includes receipt status/action.
- When an OWNER enables and configures Dynamic PromptPay QR, the final booking-group checkout screen can generate a new Thai QR Payment payload containing the exact server-recalculated amount due after charges and the one group deposit.
- Dynamic PromptPay QR is shown before settlement and receipt issuance, never as a payment request on an already-paid receipt. It is absent for non-final room checkout, zero amount due, and refund-due settlement.
- Staff must verify the recipient and amount in the banking application and explicitly confirm that funds arrived. PostgreSQL rejects PromptPay checkout when the confirmed QR amount differs from the transactional amount due.

## 16. Human-readable booking codes

- Internal primary keys are UUIDs.
- New human-readable unit booking code format:
  - `BMP-YYYYMMDD-CAT01-01`
  - `BMP-YYYYMMDD-DOG01-01`
- The date is the booking/check-in date chosen for code generation and must be documented consistently in implementation.
- The final two digits are an atomic sequence for the same date and room.
- If a prior booking was cancelled and the same room/date is booked again, use `02`, then `03`, etc.; never reuse a code.
- Multi-room requests use a group UUID/request code and one human-readable unit code per room.
- Preserve legacy booking codes in `legacy_booking_code` during migration/import.

## 17. Roles and access

Clinic roles:

- `OWNER`: full tenant management, users, settings, finance/refunds, audit, bookings, rooms, sterilization.
- `DOCTOR`: operational bookings, check-in/out, room and health review, sterilization, relevant clinical information; no tenant ownership or user administration.
- `STAFF`: booking operations, check-in/out, payment verification, charges, rooms, and sterilization operations; no owner-only settings or user administration.

Platform roles and temporary support access are described in `docs/RBAC_AND_SECURITY.md`.

## 18. Data migration position

The archive contains application source, not necessarily the clinic's complete live spreadsheet data. Do not assume the source archive is a data backup.

Before production cutover:

- export every live legacy sheet once;
- import into staging with a repeatable script;
- map old codes and statuses explicitly;
- reconcile counts and money totals;
- keep imported legacy IDs for traceability;
- run a final delta export during a scheduled write freeze;
- keep the legacy system read-only for a defined audit period.

If the user chooses not to import experimental data, seed only the clinic, room inventory, settings, and initial owner account.

## 19. Delivery sequence

1. Scaffold and quality tooling.
2. Supabase schema, migrations, RLS, seed, and transactional functions.
3. Auth and tenant membership.
4. Room inventory and planning.
5. Booking group/request and per-room animal data.
6. Back-office booking and public request.
7. Check-in/out and physical occupancy integrity.
8. Payments, expiry outbox, LINE integration.
9. Charges, receipts, and print view.
10. Sterilization module.
11. Platform Owner and temporary Support Access foundation.
12. Migration rehearsal, end-to-end tests, and Cloudflare production deployment.

Do not attempt a single unreviewed rewrite. Each phase must pass its acceptance tests before the next phase.

## 20. Completion target

The rebuild is ready for clinic use when the parity checklist in `docs/ACCEPTANCE_TESTS.md` passes, tenant and role isolation is verified, concurrent room allocation tests pass, backup/recovery and migration are rehearsed, production secrets are configured outside Git, and the public/admin flows work on desktop, iPad/tablet, and smartphone.
