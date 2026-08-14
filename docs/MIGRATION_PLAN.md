# Migration Plan

## Version 1 data decision

`CLEAN_SEED` was selected by the OWNER on 2026-08-14.

- Create the production project from reviewed migrations and `supabase/seed.sql` only.
- Provision production users through Supabase Auth; do not copy Auth rows from development or legacy systems.
- Do not import experimental/development customers, pets, bookings, stays, payments, receipts, audit events, or uploaded evidence.
- Do not import live legacy business records for Version 1. Keep any legacy system read-only for the approved audit period.
- Treat `bmp-booking-dev` as staging only. It must never be promoted or renamed into production while it contains test or rehearsal activity.

If a later release changes to `LEGACY_IMPORT`, it requires a new OWNER decision and a fresh rehearsal. Do not import from the source archive alone; live data exists in the actual Google Spreadsheet and Drive uploads.

## Preparation

- Make the legacy system read-only backup.
- Export every sheet as CSV with headers.
- Export a manifest of Drive uploads and their owning booking/payment/entity.
- Record legacy application version and export timestamp.
- Do not export or import legacy session tokens, password hashes, salts, GAS gateway keys, or LINE secrets.

## Transform

- Normalize phone numbers while preserving user-facing Thai leading-zero format.
- Parse legacy dates using known sheet formats and Asia/Bangkok; never rely on machine locale.
- Map room codes `C01–C11` to `CAT01–CAT11` and `D01–D07` to `DOG01–DOG07`.
- Map legacy booking rows into group + per-room booking units.
- Split or reconcile per-animal data through legacy pet rows, not comma text alone.
- Preserve legacy IDs/codes in explicit reference columns.
- Map enum values through a reviewed mapping table; unknown values go to an exceptions report.
- Copy eligible files to tenant-scoped Supabase Storage and update references only after checksum verification.

## Load order

1. tenants and settings;
2. profiles/membership invitations;
3. customers and pets;
4. rooms;
5. booking groups and units;
6. allocations and closed/open stays;
7. payments, charges, reschedules;
8. sterilization appointments/holidays;
9. receipts and items;
10. file assets and audit import facts.

## Reconciliation

- Row counts by source sheet and status.
- Total lodging/payment/charge/receipt amounts.
- Unique legacy and new codes.
- No invalid species-room mappings.
- No multiple open stays per room.
- No overlapping active planned allocations.
- Receipt header total equals sum of receipt items.
- Manual exception list reaches zero or has owner-approved disposition.

## Cutover

- Rehearse in staging at least once.
- Announce a legacy write freeze.
- Take final delta export.
- Run repeatable import with transaction/checkpoints.
- Reconcile and obtain clinic owner sign-off.
- Configure production secrets and domain.
- Keep legacy read-only for the agreed audit period.
- Document rollback: route traffic back only if writes can be reconciled without split-brain.

## Security

- Perform exports in an access-controlled workspace.
- Do not commit data exports.
- Delete temporary plaintext exports after verification and retained backup policy completion.
- Log migration actions and checksums, not sensitive row contents.
