# Untracked expenses

An Untracked expense is an ordinary expense for reporting, with `isUntracked = true`
and a null `accountId`. Tracked expenses retain a real account and a false flag.
Other transaction types still require their existing account relationships. The
strict server request schema rejects conflicting flags/accounts and foreign
accounts are rejected by the existing ownership checks.

The flag is persisted in MySQL, not inferred from an absent frontend account.
The form's `__untracked__` option is only a UI value; the expense adapter converts
it to the flag and an absent account reference before sending the request.
Existing transactions are not converted or backfilled.

## Balances and reports

Both ledgers skip Untracked expense effects. Switching modes replaces the record
inside the existing Serializable mutation transaction, validates the full ledger,
and writes position history atomically. Recording timestamps and snapshot cutoffs
are unchanged: changing an older expense to tracked does not reapply transactions
already included in the selected account's balance snapshot.

Monthly expense totals, category breakdowns, comparisons and trends include
Untracked expenses. **Net cash flow remains ordinary income minus all ordinary
expenses**, including Untracked allocations. Savings rate uses that same reported
net cash flow. These are reporting measures, not actual bank-account movement;
the Finance monthly section and Overview tooltip state this distinction. Bank
balances, financial assets and net worth only change for tracked ledger effects.
Transfers and investment trades remain excluded from ordinary cash-flow totals.

## Additive migration

`20261029000000_untracked_expenses` adds a non-null Boolean defaulting to false
and permits a null source account. Existing IDs, account references, amounts,
categories, notes and timestamps are retained. Foreign keys and deletion
restrictions remain in place. Apply this migration before deploying the new app.
Older application versions cannot read new accountless expenses; roll back the
application only after accounting for this compatibility constraint.

The migration was generated offline by comparing the old and new Prisma schemas.
Local application workflow:

1. Confirm both the CLI's dotenv configuration and the Next.js environment loader
   resolve to the intended non-production loopback development database. Never
   print credentials or full database URLs. Stop if either resolves remotely.
2. Use the established wrapper (it preserves TLS policy and rejects remote targets):

   ```powershell
   pnpm db:cli --local migrate status
   pnpm db:cli --local migrate deploy
   pnpm db:cli --local migrate status
   ```

3. Check the applied migration, column nullability/defaults and existing-record
   preservation. Never reset the database or alter existing financial records.

On 2026-10-29 this migration was applied only to the confirmed local `lifeos`
database. CLI and runtime configurations matched, and a read-only query confirmed
the connected schema. No remote, Preview or Production database was migrated.
Existing transaction fields and associations matched their pre-migration hash,
and the new flag defaulted to false on all three existing records. Regenerate the
Prisma client and restart any already-running development server after applying
the migration so its cached Prisma singleton uses the new model.

## Verification

The normal Finance, expense-form and Quick Add tests cover request validation,
mode changes, reporting, store reloads and ordinary expense regressions.
The opt-in integration test uses real local MySQL, two independent clients and
the actual Serializable mutation service:

```powershell
$env:LIFEOS_TEST_MYSQL_UNTRACKED_EXPENSES = "1"
node --test tests/untracked-expenses.mysql.test.mjs
Remove-Item Env:LIFEOS_TEST_MYSQL_UNTRACKED_EXPENSES
```

It refuses production or remote targets, never migrates, and creates isolated
synthetic fixture owners. Cleanup deletes only those test-owned records. Never
substitute real users or accounts. Browser checks still needed: choose Untracked
with and without accounts, create/reopen/edit/delete it, switch modes, and review
category filters/history in both themes at desktop and mobile sizes.

## Implementation files

- Model/contracts: `prisma/schema.prisma`, the migration above,
  `src/features/finance/types/finance.ts`, `types/finance-api.ts`,
  `schemas/finance-request-schema.ts`.
- Server: `src/features/finance/server/transaction-mutations.ts`,
  `server/finance-dto.ts`, `server/finance-ledger.ts`.
- Shared frontend state and adapters: `src/features/finance/store/finance-store-core.ts`,
  `utils/expense-account.ts`, `utils/expense-transactions.ts`, `utils/finance-calculations.ts`.
- UI: `src/features/finance/components/expenses/add-expense-dialog.tsx`,
  `components/overview/finance-overview.tsx`, `src/app/(dashboard)/finance/expenses/page.tsx`,
  `src/features/dashboard/components/quick-add.tsx`, `components/overview-stats.tsx`.
- Tests: `tests/expense-form.test.mjs`, `tests/finance-store.test.mjs`,
  `tests/finance-transactions.test.mjs`, `tests/quick-add.test.mjs`,
  `tests/untracked-expenses.mysql.test.mjs`.
