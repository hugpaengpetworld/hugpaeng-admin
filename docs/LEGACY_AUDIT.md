# Legacy v1.8.3 Audit

## What the archive contains

- Google Apps Script backend services and sheet setup.
- HtmlService public/admin interfaces.
- Cloudflare static frontend/Worker gateway.
- Business-rule and UI tests.
- Upgrade scripts through v1.8 and receipt features through v1.8.3.

## Behavior worth preserving

- Roles OWNER/DOCTOR/STAFF.
- Explicit booking/payment/sterilization status sets.
- Pending approval capacity consumption.
- Locking around availability and creation.
- LINE deposit and scheduled expiry.
- Per-animal rows, room planning, and sterilization calendar.
- Check-in/out, additional charges, receipts, and 80 mm printing.
- Receipt immutable snapshot principle and recoverable rendering failure.
- Responsive/dark-green design intent.

## Architecture not to preserve

- Sheet tabs as relational tables.
- Full-sheet scans and positional header lookup at runtime.
- Apps Script locks as the primary transaction mechanism.
- Custom username/password hashes and sheet-backed sessions.
- GAS Web App + gateway key + Cloudflare proxy.
- Drive folders as unstructured file database.
- Time-driven triggers without durable idempotent outbox facts.
- Raw legacy enums rendered to users.

## Legacy spreadsheet headers found

The legacy model included bookings, pets, rooms, payments, charges, reschedules, users, sessions, audit, settings, sterilization appointments/holidays, receipts, and receipt items. The detailed mapping is in `DATA_MODEL.md`.

## Known legacy defect class

Room planning could show a checked-in room as available when planned dates and room status were evaluated without treating the open stay as the physical source of truth. The new `room_stays` model and database constraints are specifically required to eliminate this defect.

## Data caution

This archive is source code, not proof of a complete live data backup. Export the live spreadsheet and uploads separately if continuity is required.
