# Production read-only preflight

No Production migrations, imports, cleanup, balance changes, deployments, pushes,
commits or Vercel environment-variable changes are authorized in this phase.
The existing private export and local environment files must remain unchanged.

## Verified Vercel metadata

Authenticated, explicit GET requests through Vercel CLI 65.9.0 on 2026-10-31
confirmed:

- Project `lifeos`, GitHub repository `Ganesh-S7/lifeos`, Production branch `main`.
- Deployment `dpl_EZRrU7CqAbxrjjkDJceePou8Rnpe` is READY, target Production,
  and belongs to the linked project.
- Deployed Git commit: `35f853f4d77e91f062465cd8273045c9fc9777b5`.
- The local intended release is `874022d`; this confirms that the later local
  feature work is not part of this Production deployment.

The actual deployment API supplied the Git SHA; the CLI's formatted `inspect
--json` response did not. Raw API JSON was kept in memory and only allowlisted
deployment/project/Git identifiers were printed. No environment values were
printed or persisted.

## Actual environment-run result — blocked

`corepack pnpm@10.10.0 dlx vercel@latest env run --help` documents the command.
However, the installed CLI did **not** execute the read-only child probe:

- From the repository, it reported loading `.env.local` and `.env`, then warned
  that four Production Secret values cannot be pulled.
- From `.lifeos-transfer/`, with the exact project and team specified and no
  default dotenv files, it warned that seven Production Secret values cannot
  be pulled. The child marker was again absent.
- Both CLI invocations returned exit 0. Exit status alone therefore does not
  establish injection, child execution, connectivity, or a successful preflight.

Do not supply missing values from local files, copy redacted placeholders,
invent a URL, modify Vercel variables, or try to extract secrets from deployment
logs. No database connection was attempted. Production database identity, TLS
handshake, owner, migrations/checksums, inventories, backups and planner counts
remain unverified.

A supported, authorized execution context that already has legitimate access to
Production variables is required. Do not send secrets through chat. This guide
does not assume that such an execution context or Aiven backup permissions exist.

## Process-environment modes and separate write approval

The transfer CLI accepts `--process-env` only for Production import. Its preview is:

```text
import --environment production --dry-run
```

It rejects export, local/test environments and `--env-file`. Dry-run rejects every
write confirmation flag and never invokes mutations. It does not call dotenv loading or parse a local
environment file; it copies only the three required database variables directly
from `process.env`, forcing the existing Production TLS policy. Missing,
redacted/placeholder, wrong-environment and invalid connection settings fail
closed. Debug traces and Prisma logging remain disabled.

An exact Production policy must have exactly one verified Production
host/port/database entry. Keep the ordinary preview policy `"readOnly": true`.
The general allowlist, local-address
rejection, verified CA/hostname handling, source hash/count/owner checks and
destination owner confirmation remain intact. A read-only policy also blocks the
existing file-based apply path, at both CLI and transaction boundaries.

Process-environment apply is now supported by the tool, but has not been executed.
It requires a **separate** private write policy with `readOnly:false` and
`allowProductionApply:true`, plus `--apply --confirm-owner --confirm-sha256
--confirm-production-write`. These confirmation flags take the same values and
checks as existing file-mode apply. The parser requires them before proceeding;
owner and package-digest matching occur before constructing the database client.
Both credential modes reject Production apply without the explicit write policy.
Policies default to `allowProductionApply:false`; no private policy was changed.

The same write-policy configuration can be previewed with `--dry-run`, without
confirmation flags and without mutations, so review and apply can use the exact
same policy. `readOnly:true` continues to reject apply at the CLI and transaction
boundaries. No destination is added automatically and no credentials are loaded
from local dotenv files in process mode.

HealthTargets replacement is separately disabled by default. See
[the replacement approval contract](data-transfer.md#reviewed-healthtargets-replacement).
It binds the destination user/target ID and existing-content fingerprint. All other
models remain create-only. Source packages and their hashes need not be regenerated.

After prerequisites and separate execution approval, run from the repository in
the user's private shell with runtime variables already configured:

```powershell
# Review the exact write policy without performing mutations.
node scripts/transfer-lifeos-data.mjs import --environment production --process-env --policy .lifeos-transfer/policy.production-write.json --package .lifeos-transfer/source-2026-10-31.json --source-owner-id $SourceOwnerId --destination-owner-id $DestinationOwnerId --owner-email $OwnerEmail --dry-run

# Future separately authorized apply; never run as part of implementation/tests.
node scripts/transfer-lifeos-data.mjs import --environment production --process-env --policy .lifeos-transfer/policy.production-write.json --package .lifeos-transfer/source-2026-10-31.json --source-owner-id $SourceOwnerId --destination-owner-id $DestinationOwnerId --owner-email $OwnerEmail --apply --confirm-owner $DestinationOwnerId --confirm-sha256 $ReviewedSHA256 --confirm-production-write
```

These paths are templates. No write policy was created and no real destination
preimage was read. Existing historical Vercel Secret-injection limitations below
remain separate from user-operated runtime configuration.

## Future invocation — not executed successfully

Only after secure identification, unique-email owner matching, actual migration
and schema checks, and exact read-only policy approval, the command shape is:

```powershell
corepack pnpm@10.10.0 dlx vercel@latest --cwd .lifeos-transfer --scope team_kRsh9z4kPEGTbbvF1xxryLkH env run -e production --project prj_hMRJH3KOJqfIdZkaEAznXJx6eTHF -- node ../scripts/transfer-lifeos-data.mjs import --environment production --process-env --policy .lifeos-transfer/policy.production-readonly.json --package .lifeos-transfer/source-2026-10-31.json --source-owner-id $SourceOwnerId --destination-owner-id $DestinationOwnerId --owner-email $OwnerEmail --dry-run
```

The separate working directory avoids the CLI automatically loading normal local
dotenv files. The transfer tool resolves its private paths against the repository,
not the child working directory. This command is a future template, **not a
workaround for the CLI's current Secret restriction**. Do not retry it as though
exit 0 meant that a child ran. Require the tool's own structured report.

Stop on any target, owner, migration or schema ambiguity, or on conflicts.
Do not configure a guessed destination just to get past the allowlist.
