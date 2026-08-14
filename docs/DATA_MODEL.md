# Data Model

## Conventions

- UUID primary keys.
- `tenant_id` on tenant-owned roots and enforced tenant reachability on children.
- `created_at`, `updated_at` as timezone-aware UTC timestamps.
- Actor fields reference authenticated profiles where applicable.
- Money uses integer satang or `numeric(12,2)` consistently.
- Display codes are unique but never used as relational primary keys.

## Core tables

| Table | Purpose / key fields |
|---|---|
| `tenants` | clinic identity, slug, status, timezone, currency |
| `tenant_settings` | branding, clinic address/phone, optional owner-enabled receipt tax identity, and payment settings including enabled flag, validated PromptPay target type/value, and expected payee name; typed columns and constraints |
| `profiles` | Supabase user profile; no password hashes in application tables |
| `tenant_memberships` | user, tenant, clinic role, active state |
| `platform_roles` | platform owner/support role assignments |
| `support_access_grants` | tenant, support user, scope, reason, approver, start, expiry, revoke |
| `customers` | owner name, normalized phone, contact channels |
| `pets` | customer, name, species/custom species, sex, breed, age, weight |
| `pet_health_profiles` | vaccination evidence, flea/tick facts, and restricted health review notes |
| `booking_groups` | one customer request, channel, service type, shared dates/contact/status |
| `bookings` | one room unit in a group, human booking code, audited quoted nightly rate and calculated lodging total in satang, status/payment/health facts |
| `booking_pets` | booking-to-pet assignment and order |
| `room_inventory` | CATxx/DOGxx, species, operational state, notes, optional retirement timestamp/OWNER/reason; initial seed is expandable and removable through audited OWNER-only RPCs without deleting history |
| `room_allocations` | planned room/date hold/reservation and release facts |
| `room_stays` | actual check-in/out, room, booking, notes, deposit, actors |
| `payments` | type, amount, status, evidence, verification/refund facts; LINE deposits belong to `booking_group_id` so a multi-room group has one required deposit |
| `booking_charges` | structured checkout catalog type (food, medicine, IV fluids, blood test, flea/tick, named vaccines, veterinary service, or other), optional/required description, quantity, integer-satang unit price, service date |
| `reschedule_requests` | old/new ranges, verification and decision facts |
| `sterilization_appointments` | customer/pet/date/time/status/overbook acknowledgement |
| `sterilization_holidays` | closed date/reason/active state |
| `receipts` | one immutable booking-group financial/customer/stay snapshot; address/phone are always eligible and optional tax heading/ID/branch values are copied only when enabled |
| `receipt_items` | immutable line items |
| `file_assets` | storage path, purpose, MIME, size, owner entity, scan/validation status |
| `audit_logs` | append-only tenant/action/entity/actor/support-grant metadata |
| `outbox_events` | reliable pending/sent/failed notification and integration events |
| `idempotency_keys` | request key, scope, response/result reference, expiry |
| `daily_sequences` | atomic booking/receipt suffix generation when not implemented by advisory lock/function |

## Booking grouping

Owner data is entered once in `booking_groups`. Each requested room is a `bookings` row. Animals are assigned to each unit through `booking_pets`. This supports multi-room requests without comma-separated names or duplicated owner input.

Operational pet identity is separated from `pet_health_profiles` so staff can work with names/species without receiving broad health-document access. Owner and doctor access is the default; narrower staff access must be granted through an explicitly approved server-side permission in a later phase.

LINE deposit, checkout settlement, refund, and active receipt uniqueness are scoped by `booking_group_id`. `receipt_items.booking_id` keeps each room unit traceable inside the combined group receipt.

The public/default nightly rate is derived from animal count. A back-office quote may override it per `bookings` room unit, but must remain a positive integer-satang amount. The create function records the standard and quoted values in `audit_logs`; clients do not update price columns directly.

## Room occupancy integrity

- `room_allocations` represents planned date capacity.
- `room_stays` represents physical occupancy.
- Partial unique index: one row with `checked_out_at IS NULL` per room.
- Partial unique index: one open stay per booking.
- Check-in procedure locks room and booking and verifies species/state.
- Checkout procedure closes stay and changes room operational state to cleaning.
- UI room status is derived with priority: open stay > blocking operational state > planned allocation > available.
- `retired_at IS NULL` defines active inventory. Retirement sets the room to `DISABLED`; planning omits it, while foreign keys and immutable history continue to resolve its original room code.

## Suggested indexes

- Every table: tenant-leading indexes for common queries.
- `booking_groups (tenant_id, status, check_in_date, check_out_date)`.
- `bookings (tenant_id, status, room_id)` and unique `(tenant_id, booking_code)`.
- `room_inventory (tenant_id, species, operational_status)` and unique `(tenant_id, room_code)`.
- `room_allocations (tenant_id, room_id, start_date, end_date)` plus overlap protection.
- `room_stays (tenant_id, room_id)` partial where checkout is null.
- `sterilization_appointments (tenant_id, appointment_date, status)`.
- `payments (tenant_id, booking_group_id, status)` for group deposits and tenant/booking indexes for unit-level checkout/refund facts.
- `audit_logs (tenant_id, created_at desc)`.
- `outbox_events (status, available_at)`.

## Legacy-to-new mapping

| Legacy sheet | New model |
|---|---|
| การจอง | booking_groups + bookings + room_allocations |
| สัตว์เลี้ยง | pets + booking_pets |
| ห้องและกรง | room_inventory |
| การชำระเงิน | payments |
| ค่าใช้จ่ายเพิ่มเติม | booking_charges |
| คำขอเลื่อนวัน | reschedule_requests |
| ผู้ใช้งาน | Supabase Auth + profiles + tenant_memberships |
| ประวัติการใช้งาน | audit_logs |
| ตั้งค่า | tenant_settings |
| นัดทำหมัน | sterilization_appointments |
| วันหยุดทำหมัน | sterilization_holidays |
| ใบเสร็จ | receipts |
| รายการใบเสร็จ | receipt_items |

Never import legacy sessions, password hashes, salts, GAS tokens, or gateway keys. Create users through Supabase Auth invite/reset flows.
