# Backup and Restore Drill

## Scope

This drill proves that Supabase PostgreSQL data and required Storage objects can be recovered without using production as the restore target. Perform it in staging before cutover and after material schema changes.

## Backup evidence

1. Record the source project reference and UTC backup timestamp.
2. Capture migration list and application release identifier.
3. Export schema/data using the current Supabase-supported backup method or restore a managed backup to a separate project.
4. Export a Storage object manifest containing bucket, tenant-scoped path, size, MIME type, and checksum. Do not put signed URLs or credentials in the manifest.
5. Store backup artifacts in access-controlled storage outside the repository.

## Restore procedure

1. Create an isolated restore target with no production traffic.
2. Restore PostgreSQL and Storage objects.
3. Apply only reviewed forward migrations newer than the backup.
4. Configure test-only Auth redirect URLs and secrets.
5. Run schema/pgTAP tests, database integration tests, and application smoke tests.

## Reconciliation

- Counts by tenant/entity/status.
- Payment, charge, deposit, refund, and receipt totals.
- Receipt item sum equals immutable receipt total.
- No overlapping active room allocations or multiple open stays.
- CAT/DOG room inventory and species mapping are valid.
- Migration and legacy ID maps remain unique.
- Storage manifest count/checksums match.
- Expired/revoked support grants cannot read tenant data.

## Pass criteria

The drill passes only when reconciliation differences are zero or have an OWNER-approved disposition, the application can authenticate against the restore target, and critical booking/check-in/checkout/receipt flows succeed. Record restore time objective and observed data-loss window; the clinic must approve both before production.
