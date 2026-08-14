# Product Requirements

## Users

- Customer: submits overnight request, checks availability count, follows status, and requests one permitted reschedule.
- Staff: creates bookings from all channels, assigns rooms, verifies payment, checks in/out, adds charges, and operates sterilization appointments.
- Doctor: staff operations plus health review and medical-relevant sterilization information.
- Clinic Owner: full tenant control, users, settings, finance, refunds, and audit.
- Platform Owner: manages tenants and platform health without automatically reading tenant data.
- Support Agent: receives time-limited, scoped access only through an approved Support Access grant.

## Primary journeys

### Public boarding request

1. Customer selects dates, species, animal count, and booking channel context.
2. Server returns available capacity count without exposing exact room assignment.
3. Customer enters owner and per-animal data and optional health evidence.
4. Server validates rules and atomically creates a capacity hold.
5. Staff reviews and approves/rejects.
6. If LINE, approval starts a one-hour 500 THB deposit deadline for the whole booking group, not for each room unit.
7. Verified payment confirms; missed deadline expires and releases the hold.

### Back-office booking

1. Staff chooses number of rooms.
2. Staff enters owner once.
3. Staff enters per-room and per-animal details.
4. Server validates weight/capacity and atomically allocates rooms or returns conflicts.
5. Booking enters the appropriate confirmed/pending state for its channel.

### Check-in and checkout

1. Staff filters waiting bookings by cat/dog.
2. Staff selects a same-species valid room from the modal dropdown.
3. Staff records deposit and notes, then checks in.
4. Room remains physically occupied until explicit checkout.
5. Staff reviews lodging, additional charges, and deposit.
6. Each room checkout closes its stay and sets that room to cleaning. After every active room unit in the booking group is checked out, the system issues one combined group receipt and applies the group's deposit once.
7. The receipt shows address and phone by default. Tax heading, tax ID, and branch number appear only when an OWNER explicitly enables and configures them in Settings.
8. An enabled Dynamic PromptPay QR is generated from the server-recalculated final amount due after the booking-group deposit. Staff confirms funds received before checkout issues the paid receipt; zero/refund/non-final settlements do not show a QR.

### Sterilization appointment

1. Authorized user selects a date and enters customer/pet details.
2. Normal capacity is four.
3. Overbooking requires an explicit warning and audit.
4. Calendar shows individual clickable pet rows and capacity color.

## Functional modules

- Authentication and tenant membership.
- Public request and status/reschedule flow.
- Customers and animals.
- Boarding booking groups and room units.
- Room inventory, availability, planned allocations, and physical stays.
- Check-in/check-out operations.
- Payments, deposits, charges, refunds, and receipts.
- Sterilization calendar and holidays.
- Clinic settings and branding.
- Users, roles, audit, and temporary support access.
- LINE notification integration and reliable background processing.

## Non-functional requirements

- Responsive on current desktop browsers, iPad/tablet, and smartphone.
- Thai-first accessible interface.
- Tenant isolation and least privilege.
- Atomic capacity decisions under concurrency.
- Idempotent external notifications and scheduled expiry.
- No customer-sensitive data in URLs or application logs.
- Recoverable database migrations and documented backup/restore.
- Critical admin list interactions should feel immediate; target cached/list reads below two seconds under normal clinic load, with visible loading feedback for slower operations.
- Audit facts are append-only.

## Version 1 registry foundation

- A tenant-scoped customer/patient registry searches by phone, owner name, pet name, or exact HN.
- Selecting one customer permits selecting several of that customer's existing pets and adding another pet.
- New customer creation requires at least one pet and may create up to ten pets transactionally.
- Each pet has a separate immutable tenant HN; boarding and sterilization store registry references instead of requiring repeated customer entry.
- Six clinic roles use OWNER/ADMIN-configurable capabilities; ADMIN has all tenant capabilities except managing OWNER accounts.

## Out of current parity scope

- Full POS.
- Employee attendance/payroll.
- Complete medical record or diagnosis module.
- Native Windows/macOS installation package.
- Marketplace billing for SaaS tenants.

Create extension boundaries for these, but do not build them during the clinic parity milestone.
