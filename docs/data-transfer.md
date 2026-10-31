# User-scoped local-to-Production transfer

For the current **read-only Production phase**, use
[the process-environment preflight guide](production-read-only-preflight.md).
Do not use the pulled `[SENSITIVE]` file as a database configuration source.
The file-based Production write examples below describe a future separately
authorized cutover; they do not apply to the read-only process-environment mode.

This is an operator CLI, not an application endpoint or a whole-database clone.
No schema change is required. The old local-only monthly importer is unchanged;
**never remove its remote guard or expose its upsert behavior to Production**.

## Verified source and current release gates

On 2026-10-31, read-only inspection confirmed loopback `localhost:3306/lifeos`:

- Ganesh S's explicitly selected local owner, matched by email, has 17 Health logs
  on 17 distinct dates, 2026-10-13 through 2026-10-29; 11 contain weight.
- One HealthTargets record contains all eight target fields.
- Eleven historical snapshots and the separate 15-target plan match every value
  in the existing validated historical source. Plan total/reference/buffer are
  INR 33,403 / 34,800 / 1,397. No transactions are generated from these values.
- Fifteen owned category rows exist: Food, Bills and Other are built-ins; the 12
  selected custom definitions are Bike, EMI, Fuel, Groceries, GYM, Invest, Laundry,
  Purchase, Rent, SUP, Taxi and Traveling. Groceries also has a mock transaction
  association; only its useful category definition is exported, never that entry.
- All five repository migrations are applied locally. Production migration
  status, destination identity, existing data, backups and Vercel's deployed
  commit/Production branch remain unverified. The preceding cutover audit is in
  this development chat; there is no separate audit-report file in the repository.

The generated private `policy.local.json` intentionally has **empty destination
allowlists**. It cannot authorize a destination import. No Production connection,
write, migration, user creation, cleanup or deployment was performed.

## Exact data allowlist

The strict package has exactly these arrays (unknown keys/models are rejected):

| Array | Data and relationship |
| --- | --- |
| `healthLog` | All selected owner's dated measurements, source IDs, owner IDs and timestamps |
| `healthTargets` | One separate targets record and its original updatedAt |
| `monthlyFinanceSnapshot` | Eleven December 2025–October 2026 summaries, with categories, total, income, LEFT and timestamps |
| `financeSpendingPlan` | One separate IDEAL plan, 15 targets, reference income and timestamps |
| `expenseCategory` | Owned custom definitions used by the plan, plus explicitly reviewed additional category IDs |

No bank accounts, transactions, income ledger entries, investments, liabilities,
position history, auth accounts/sessions/users, rate limits or operational data
are exported or imported. Every record must reference the manifest's source
owner. Existing Production identity is read, never created or updated.

Built-in categories remain globally available without seed rows. Mock-only
category definitions are excluded by default. Additional useful custom definitions
require explicit `additionalCategoryIds` in the policy and matching reviewed
counts; unknown/foreign-owner IDs fail export. Removing a category from a plan or
this package never deletes any category or historical label.

## Package, precision and equality

- Version 1 contains source owner ID/email, a source endpoint fingerprint,
  export timestamp, schema SHA-256, required migration names, counts and records.
  The destination mapping is deliberately required at import time.
- Health Decimal fields use exact fixed-two-decimal **strings**, with NULL kept
  distinct from zero. Integers retain their units. Dates use the existing UTC
  DATE serializer; timestamps retain original UTC milliseconds. No hours/litres
  display conversion is used for transfer.
- Health measurements and targets live in separate tables, both referencing
  User. There are no child measurement tables. The importer writes explicit
  original timestamps, rather than replaying the normal Health save API.
- Finance amounts use exact decimal strings in the package. JSON category
  amounts return to the existing bounded numeric representation on insert.
  All historical values and IDEAL targets are checked against
  `readHistoricalSource()`; differing totals, LEFT, names, months or targets fail.
- SHA-256 covers canonical manifest and record content. Unknown fields,
  noncanonical transformed values, wrong counts and changed hashes fail closed.
  This detects accidental modification; it is not a digital signature. Trust
  the reviewed package/policy and protect their custody.
- New record IDs are `lx_` plus SHA-256 of version, source fingerprint, source
  owner, destination owner, model and source ID. They are stable across exports
  and differ between destination owners/models. Plans retain the schema's
  destination-user primary key. No mapping table or schema migration is needed.
- Exact Health equality includes measurements, date and original timestamps;
  ID/owner remapping is excluded. Same-date differing metadata or values is a
  conflict, not an automatic merge. Exact existing daily records can be skipped
  even if their IDs differ; the internal reconciliation map uses the existing ID.
- Existing targets must match exactly, including updatedAt; otherwise stop.
- Snapshot/plan equality compares financial content; existing destination
  metadata is preserved on identical skips. A differing plan, including a NULL
  reference income, is a conflict. Nothing initializes or replaces it silently.
- Equivalent category names use the existing NFKC/case/whitespace normalization.
  Existing equivalent definitions are skipped and mapped to their existing IDs.
  Invalid/duplicate destination normalization is rejected.

There is no update/upsert/delete path. All conflicts are collected before apply.
Apply runs in one Serializable Prisma transaction. Concurrent unique/serialization
failures roll back the whole operation and return a sanitized conflict code;
there are no retries. A later app edit can make a rerun conflict: review it,
do not overwrite the user's newer values.

## Private files and environment policy

Run from the repository with Node 22.23.3 or the repository's compatible Node 22:

```powershell
node scripts/transfer-lifeos-data.mjs prepare
```

This creates `.lifeos-transfer/` with owner-only Windows ACLs (0700 on POSIX).
Both `.gitignore` and `.vercelignore` exclude the entire directory. The tool
checks exclusions and refuses tracked artifacts, symlinks, path traversal and
files outside that directory. Packages are created exclusively, never overwritten.
Policies, private environment files and packages belong here. Maximum read size
is 20 MiB. The existing repository `.env` is allowed only for local export.

**Packages contain plaintext sensitive Health information.** Do not commit,
paste into chat, print, or upload them to Vercel. Use approved encrypted storage
and transport when moving them. These ACLs do not provide encryption. Review
privately in a trusted local editor and restrict access/retention appropriately.

Create a policy using the verified endpoint, not a guessed environment label:

```json
{
  "version": 1,
  "source": { "host": "localhost", "port": 3306, "database": "lifeos" },
  "destinations": { "production": [], "local-test": [] },
  "expectedCounts": {
    "healthLog": 17,
    "healthTargets": 1,
    "monthlyFinanceSnapshot": 11,
    "financeSpendingPlan": 1,
    "expenseCategory": 12,
    "weightMeasurements": 11,
    "planTargets": 15
  },
  "additionalCategoryIds": []
}
```

For Production, copy the local policy to `policy.production.json` and add the
**independently confirmed** Aiven DNS host, port and database to `production`.
Match them against Vercel's Production configuration and the intended Aiven
service. Never infer a role from `DATABASE_URL` or a filename. Stop if uncertain.

Put the actual destination DATABASE_URL, `DATABASE_SSL_MODE=verify`, and valid
provider PEM DATABASE_SSL_CA in `.lifeos-transfer/production.env`, using the
project's existing dotenv PEM convention. An optional NODE_ENV must be correct.
No credentials are command-line arguments. The CLI reads only the explicitly
chosen file, with **no process-env/Next/dotenv fallback** for connection inputs.
URL query overrides are rejected. Production requires remote, allowlisted
host/port/database and verified chain/hostname/CA using `databaseAdapterOptions`.
The existing 10-second timeout and pool limit 5 remain unchanged. There is no
insecure fallback. Driver debug traces and Prisma logging are disabled by the CLI.

`local-test` destination mode accepts only an explicitly allowlisted loopback
database named `lifeos_transfer_test` or `lifeos_transfer_test_SUFFIX`, never the
source database. The CLI never creates or migrates this test database.

## Commands: separate review and execution

Set operator inputs without displaying secrets. `$OwnerEmail` must match the
source and existing destination email. Local/Production IDs are independent.
If the testing account uses a different email, stop for an explicitly reviewed
identity-mapping decision; do not rename or replace its Better Auth account.

```powershell
$SourceOwnerId = 'Yvn47nRqs58NvkzjblPxVhVc8FiZaU0F'
$DestinationOwnerId = '<confirmed existing Production user ID>'
$OwnerEmail = '<confirmed account email>'
$Package = '.lifeos-transfer/source-2026-10-31-v2.json'

# Read-only source export preview; no artifact or database writes.
node scripts/transfer-lifeos-data.mjs export --environment local --env-file .env --policy .lifeos-transfer/policy.local.json --package $Package --source-owner-id $SourceOwnerId --owner-email $OwnerEmail --dry-run

# Export a NEW private file. Choose a new filename if it already exists.
node scripts/transfer-lifeos-data.mjs export --environment local --env-file .env --policy .lifeos-transfer/policy.local.json --package $Package --source-owner-id $SourceOwnerId --owner-email $OwnerEmail --write

# Read-only Production preview, only after target/identity/schema confirmation.
node scripts/transfer-lifeos-data.mjs import --environment production --env-file .lifeos-transfer/production.env --policy .lifeos-transfer/policy.production.json --package $Package --source-owner-id $SourceOwnerId --destination-owner-id $DestinationOwnerId --owner-email $OwnerEmail --dry-run

# Copy the digest of THIS saved, reviewed package from its preview.
$ReviewedSHA256 = '<reviewed packageSHA256>'
node scripts/transfer-lifeos-data.mjs import --environment production --env-file .lifeos-transfer/production.env --policy .lifeos-transfer/policy.production.json --package $Package --source-owner-id $SourceOwnerId --destination-owner-id $DestinationOwnerId --owner-email $OwnerEmail --apply --confirm-owner $DestinationOwnerId --confirm-sha256 $ReviewedSHA256 --confirm-production-write

# Repeat the same dry-run: all identical records should skip, zero creates/conflicts.
node scripts/transfer-lifeos-data.mjs import --environment production --env-file .lifeos-transfer/production.env --policy .lifeos-transfer/policy.production.json --package $Package --source-owner-id $SourceOwnerId --destination-owner-id $DestinationOwnerId --owner-email $OwnerEmail --dry-run
```

Dry-run uses SELECT-only application operations and never invokes a mutation
delegate or DDL. Reports contain counts, safe conflict codes and package digest,
not measurements, SQL, connection URLs or exceptions. `create` means **planned**
creates in dry-run and completed creates in a successful apply. Exit 0 means
success; dry-run conflicts return 2; rejected/failed operations return 1. A
conflicting apply returns counts/codes with `applied:false` and performs no writes.
Export dry-run generates a fresh export timestamp/digest; confirm the saved
package's import-preview digest, not an earlier export-preview digest.
The verified package from this task is `source-2026-10-31.json`; the commands
above use a fresh `-v2` filename to avoid overwriting it. Freeze local entry during
the final export/cutover window, or review new counts and re-export if source
records change. Do not silently accept an outdated package after further edits.

## Production migration/deployment runbook — not executed

1. Review the existing 22 release commits beyond remote main `35f853f` and finish
   local manual checks. Confirm Vercel's actual Production branch/deployed SHA.
2. Verify the destination owner by unique email plus explicit ID. Check existing
   Health dates/targets, summaries and plan without logging sensitive values.
   Stop on ambiguous ownership, conflicting records or an unexpected database.
3. Establish backups and a tested recovery procedure. MySQL 8.4.11 client/dump
   tools are installed locally, but hosted dump permissions, Aiven backup
   retention and restore rights have **not** been established. Do not assume
   backups exist. Do not proceed to writes without a verified recovery point.
4. In a **clean protected migration shell**, select the verified Production env
   file. Stop if DATABASE_URL/SSL settings are already inherited from another
   environment. `DOTENV_CONFIG_PATH` is supported by the wrapper's dotenv loader:

   ```powershell
   $env:DOTENV_CONFIG_PATH = (Resolve-Path .lifeos-transfer/production.env).Path
   corepack pnpm@10.10.0 db:cli check
   corepack pnpm@10.10.0 db:cli migrate status
   ```

   Inspect actual `_prisma_migrations` through approved read-only access. Candidate
   pending order is `20261028000000_expense_categories`, then
   `20261029000000_untracked_expenses`, then `20261030000000_monthly_breakdown`.
   This is **not a verified Production pending list**. Stop if earlier migrations
   are missing, checksums differ beyond understood line endings, or any failed
   migration exists. Do not rewrite migration history.
5. Only after backup/target/pending-list approval, use the unchanged secure wrapper:

   ```powershell
   corepack pnpm@10.10.0 db:cli migrate deploy
   corepack pnpm@10.10.0 db:cli migrate status
   ```

   It applies pending migrations in repository order, not a manually chosen subset.
   No direct Prisma CLI bypass, reset, truncate or automatic retry is permitted.
   MySQL DDL can partially commit: stop and investigate any failure.
6. Apply additive schema changes **before activating code** that requires them.
   Build with `prisma generate --config prisma7.config.ts && next build --webpack`
   through `corepack pnpm@10.10.0 build`; deploy through the confirmed Vercel
   workflow. No deployment command is invented here.
7. The importer verifies applied migration completion, database identity, column
   types/nullability, owner FKs, unique keys and category normalization collation.
   It rejects incompatible destinations; it never repairs schema automatically.
8. Review the private package and Production dry-run. Expected empty destination:
   17 logs, 1 targets record, 11 snapshots, 1 plan and 12 categories = 42 creates.
   Existing identical records reduce creates. Any conflict blocks all apply writes.
9. Run the explicit apply command only after reviewing its digest and owner.
   Repeat dry-run and verify ownership, all original dates/timestamps/measurements,
   source-to-destination ID mappings, totals and target values. Compare protected
   Finance ledger/accounts/positions/auth data before/after; they must be unchanged.
10. Run authorized Production login/Health/Finance/Untracked/Monthly Breakdown
    smoke checks, then begin genuine daily tracking. November 2026 onward uses
    genuine transactions; historical snapshots never become synthetic ledger rows.

On failure, the import transaction rolls back. On a post-commit discrepancy, stop
further imports and reconcile the package and deterministic mappings. Do not
automatically delete records, reset, down-migrate, or restore over newer genuine
entries. Old app rollback is unsafe once new Untracked records have NULL accountId.

## Tests and limits

- `tests/data-transfer.test.mjs`: strict scope, mapping, precision, hashes, counts,
  reconciliation, categories, conflict/skip semantics, dry-run, TLS/allowlists,
  explicit confirmation, redaction and artifact exclusion.
- `tests/data-transfer.mysql.test.mjs`: opt-in real loopback `lifeos` test, with
  synthetic fixtures created only inside transactions that **always roll back**.
  No delete/cleanup, schema changes or committed fixture writes. Verifies all
  models after dry-run, successful in-transaction creates/reruns, conflicts,
  late write failure rollback, real source hashes and protected global counts.
  Use a quiet local database; never run against Production:

  ```powershell
  $env:LIFEOS_TRANSFER_TEST_SOURCE_OWNER_ID = '<approved existing local source owner ID>'
  $env:LIFEOS_TEST_MYSQL_DATA_TRANSFER = '1'
  try { node --test tests/data-transfer.mysql.test.mjs } finally {
    Remove-Item Env:LIFEOS_TEST_MYSQL_DATA_TRANSFER
    Remove-Item Env:LIFEOS_TRANSFER_TEST_SOURCE_OWNER_ID
  }
  ```

The full normal suite must leave this and all other MySQL opt-in flags disabled.
Production target/user/conflict checks and post-import read-back remain release
gates. No live Production transfer has been tested or executed.
