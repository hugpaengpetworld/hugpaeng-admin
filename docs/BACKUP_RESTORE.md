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

## Gate 3 GitHub Actions drill

The manual workflow `.github/workflows/restore-drill.yml` is locked to these non-production projects:

- Source CLEAN staging: `wnnxdcxuxupmnplkegkt`
- Isolated restore target: `svgmzjphmdqfeptalxhe`

Configure these GitHub Actions repository secrets before running **database restore drill**:

- `CLEAN_STAGING_DB_PASSWORD`
- `RESTORE_DRILL_DB_PASSWORD`
- `RESTORE_DRILL_ANON_KEY`
- `RESTORE_DRILL_SERVICE_ROLE_KEY`

Store only the raw database passwords in the two password secrets. The workflow percent-encodes them and constructs process-only Session pooler URLs. Never store a database URI in source control.

The workflow creates roles/schema/data dumps on the encrypted ephemeral runner, records only SHA-256 evidence, and never uploads the dumps as Actions artifacts. It then destructively rebuilds only the hard-locked restore target from reviewed migrations without seed data, restores the source application data, reconciles the complete `public` schema and every public table fingerprint, verifies Auth create/login/delete, runs all database integration workflows, verifies fixture cleanup, and removes the temporary dumps even when a step fails.

For this CLEAN staging drill, Storage contains no uploaded objects. The reviewed migrations recreate the private `tenant-assets` bucket and its policies. A later drill with uploaded objects must additionally export, restore, and checksum the object manifest and binaries; PostgreSQL dump files do not contain Storage object binaries.

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
