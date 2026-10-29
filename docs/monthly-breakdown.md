# Monthly Breakdown

Route: `/finance/monthly-breakdown`, linked from the existing Finance header. The
shared navigation registry supplies its Finance parent breadcrumb and active state.
The feature adds no changes to ledger calculations or existing transaction forms.

## Sources and calculations

- `MonthlyFinanceSnapshot` stores one user-owned, unique `YYYY-MM` summary with
  structured category amounts plus Decimal INCOME/TOTAL/LEFT. December 2025 through
  October 2026 use these snapshots exclusively, even when ledger entries exist in
  those months. Missing historical snapshots render unavailable, not invented zeroes.
- `FinanceSpendingPlan` stores one current user-owned JSON target list and optional
  Decimal reference income. It is separate from snapshots and has no versioned
  monthly budgets. The IDEAL row uses this saved plan and its imported reference
  income, never a synthetic salary transaction.
- November 2026 onward uses calendar-month transaction dates, following LifeOS's
  date-only local-calendar conventions. Ordinary expense totals include Untracked
  expenses. Income sums only `income` transactions, including multiple entries;
  no income entry means INCOME and LEFT are unavailable. Transfers and portfolio
  purchases/sales are excluded from both. An ordinary expense categorized Invest
  still counts as spending. LEFT is recorded income minus reported spending, not
  bank balance. Existing global cash-flow/savings-rate rules remain unchanged.
- Live rows cover November 2026 through the browser's current month. Future months
  are not fabricated. A complete loaded ledger with no expenses totals zero; no
  income entry is still unavailable. No income carries forward. Extra used live or
  plan categories are appended after the original 15 columns.
- Existing category name equivalence handles case/whitespace. Differently named
  categories (Purchase/Shopping, Traveling/Transport) stay distinct. Only the
  source label `Fule` maps to `Fuel` during import; existing ledger labels are not
  renamed. Snapshot amounts remain the supplied values.

The comparison chart uses these same rows for spending and income, with a current
IDEAL reference line across all months (not a claim about historical plans). Red
spending bars indicate spending above recorded income. Category trends use the
same category amounts, retain every month and leave unavailable history as gaps.
The scrollable table provides precise accessible values for both charts.

## Management API and editor

`GET /api/finance/monthly-breakdown` reads only the session user's snapshots and
plan. `PUT` accepts only `{ targets: [{ name, amount }] }`; owner, reference income
and snapshots cannot be supplied by a browser. Writes use the existing mutation
origin protection and a Serializable Prisma transaction. Amounts must be finite,
non-negative, safe numeric money with at most two decimal places. Category names
use the existing validation/normalization and must be unique. At most 100 targets
are accepted, and their aggregate must fit the supported money range.

Manage spending plan opens a fresh draft on each use. It supports add/edit/remove,
total preview, save/cancel and guarded asynchronous saves. The existing searchable,
creatable category component and category service are reused. Removing a target
never deletes a category, snapshot or transaction. Failures retain the draft and
show nontechnical feedback. The saved plan is reloaded from MySQL across sessions.
All responses are private/no-store; errors use existing sanitized diagnostics and
Finance conflict conventions. The frontend uses the existing authenticated Finance
store for live records and adds no second transaction store or browser persistence.

## Local migration and explicit import

`20261030000000_monthly_breakdown` only creates the two tables, unique keys and
owner foreign keys. It never alters existing Finance models or backfills ledger
records. Apply the migration before deploying this code. Regenerate Prisma and
restart any already-running development server so its cached client has the new
models.

Before writes, verify CLI dotenv and Next runtime environment loading both resolve
to the intended non-production loopback `lifeos` database. Do not print credentials
or full URLs. Stop for remote/mismatched targets. Use the existing wrapper:

```powershell
pnpm db:cli --local migrate deploy
pnpm db:cli --local migrate status
```

`scripts/import-monthly-breakdown.mjs` requires explicit owner ID, part and mode.
It validates all 12 supplied rows before connecting, including plan-only imports.
Blank/null/zero normalize to zero. All 15 category amounts must sum to supplied
TOTAL; INCOME must be 34800 and LEFT must equal INCOME minus TOTAL. IDEAL must total
33403 with a 1397 buffer. Any discrepancy stops the import and reports the exact
source row discrepancy without changing financial history.

The importer independently checks both environment loaders, rejects remote or
production targets, confirms `SELECT DATABASE()` and checks the selected owner
exists. The operator must identify the intended existing local profile first; if
more than one plausible real owner exists, stop and select an explicit owner ID.
Never select users from untrusted request parameters or copy an arbitrary owner.

```powershell
node scripts/import-monthly-breakdown.mjs --owner-id OWNER_ID --part all --dry-run
# Separate operations are available when desired:
node scripts/import-monthly-breakdown.mjs --owner-id OWNER_ID --part history --apply
node scripts/import-monthly-breakdown.mjs --owner-id OWNER_ID --part plan --apply
# Or apply both atomically after reviewing the dry run:
node scripts/import-monthly-breakdown.mjs --owner-id OWNER_ID --part all --apply
node scripts/import-monthly-breakdown.mjs --owner-id OWNER_ID --part all --dry-run
```

History reruns upsert by owner/month and report creates, updates and unchanged
rows. No data is deleted. The plan initializes separately only when absent. Reruns
preserve edited targets; an existing plan missing its reference income receives
only the supplied reference, without replacing its targets. Income is never
imported into the transaction ledger, nor are category sums expanded to expenses.

## Completed local verification on 2026-10-30

CLI/runtime targets matched the loopback `lifeos` development database. The real
Ganesh S profile (`Yvn47nRqs58NvkzjblPxVhVc8FiZaU0F`), matching the existing app
profile and two bank accounts, was selected; the other local owners were explicitly
named verification fixtures. No credentials or tokens were printed.

All 12 source rows reconciled exactly. Dry run: 11 creates, 0 updates, plan create.
Apply: 11 historical snapshots and one separate plan with 15 targets. Follow-up dry
run: 0 creates, 0 updates, 11 unchanged, preserve saved plan. Read-back matched all
source values. IDEAL totals 33403, reference income 34800, reference buffer 1397.
A before/after hash of all existing transactions, bank accounts, investments,
liabilities and financial-position snapshots matched. No synthetic transactions
were created. Preview and Production were not migrated or imported.

The opt-in real MySQL test uses two clients and isolated temporary owners. It
tests dry runs, separate initialization, repeat imports, cross-owner isolation,
plan editing/removal, reload persistence, preserved historical rows/categories and
no ledger writes. Cleanup removes only the owners created by that test:

```powershell
$env:LIFEOS_TEST_MYSQL_MONTHLY_BREAKDOWN = '1'
node --test tests/monthly-breakdown.mysql.test.mjs
Remove-Item Env:LIFEOS_TEST_MYSQL_MONTHLY_BREAKDOWN
```

Other tests cover every supplied amount with a pinned source checksum, exact
reconciliation, blank/Fule normalization, live aggregation/exclusions, unavailable
states, table/charts/editor rendering, API authentication/origin/ownership and
plan-only requests. Browser review should include desktop/mobile in both themes,
plan changes/cancel/refresh, category creation, missing income/history, and the
November transition. Do not alter genuine historical data merely to test states.

Browser inspection on the local authenticated development server confirmed the
imported table order, sticky headers/Month column, both charts and tooltips,
category selection updating the trend, the
populated editor, draft total recalculation and cancellation. An unchanged plan
was saved successfully through the UI and refreshed without changing its targets.
Light and Dark themes and a narrow CSS viewport (browser zoom, not a physical
mobile device) were reviewed, including the editor; original zoom/theme were
restored. The existing development server was restarted after Prisma generation
to replace its old cached client. Live November transition and missing-income
scenarios are covered by tests rather than fabricated browser records. Actual
mobile touch/keyboard behavior and category creation in this new editor remain
manual checks.

## File map

- Prisma: schema and `20261030000000_monthly_breakdown` migration.
- `src/features/finance/monthly/contracts.ts`, `calculations.ts`, `format.ts`:
  typed contracts, source separation, exact money aggregation and INR display.
- `src/features/finance/monthly/server/`: owned reads/writes, HTTP handler,
  reconciled source JSON and import service.
- `scripts/import-monthly-breakdown.mjs`: explicit local-only import command.
- `src/app/api/finance/monthly-breakdown/route.ts`: authenticated GET/PUT entry.
- `src/app/(dashboard)/finance/monthly-breakdown/page.tsx` and
  `src/features/finance/monthly/components/`: page, table, charts and plan editor.
- `src/features/finance/monthly/api.ts`: validated, non-cached feature API client.
- `src/lib/navigation.ts` and the existing Finance header: route/breadcrumb and
  navigation link only; existing Overview content/layout is otherwise unchanged.
- `tests/monthly-breakdown.test.mjs`, `monthly-breakdown-api.test.mjs`,
  `monthly-breakdown.mysql.test.mjs`: source/calculation/UI, API-policy and opt-in
  real MySQL coverage respectively.
