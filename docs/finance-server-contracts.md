# Finance server contracts — Task 1

These contracts are foundations for future APIs. No routes, database operations,
UI connections, store changes, or persistence changes are included in this task.

## Product decision: start fresh

The future authenticated Finance response represents only that user's MySQL
records. An empty user receives empty `accounts`, `investments`, `liabilities`,
`transactions`, and `positionHistory` arrays. Reading an empty database must not
create a zero baseline or seed example records.

There is no localStorage import, merge, preview, or migration contract. The
existing store's browser behavior remains unchanged until a later integration
task. Existing `demoAccount` records are deliberately absent from API contracts.

## Request bodies

`src/features/finance/schemas/finance-request-schema.ts` exports strict Zod
schemas and their parsed TypeScript types. These are JSON contracts, separate
from React Hook Form input transformations.

| Schema | Editable fields |
| --- | --- |
| `bankAccountRequestSchema` | `name`, `balance` |
| `investmentRequestSchema` | `name`, `type`, `value` |
| `liabilityRequestSchema` | `name`, `type`, `balance`, optional `monthlyPayment` |
| `financeTransactionRequestSchema` | `type`, positive `amount`, `description`, `date`, required `accountId`, optional `note`, and type-specific fields below |
| `financeHistoryQuerySchema` | Optional ISO timestamp filters `from` and `to`; validates ordering by instant |
| `financeRecordParamsSchema` | A non-empty record `id` for future route parameters |

Income permits an optional category; expenses require a category. Transfers
require a different `destinationAccountId`. Investment purchases and sales
require `investmentId`. Unrelated relationship fields are rejected for each
type. References are opaque strings, accommodating Prisma-generated IDs without
conflating database identifiers with displayed account names.

Bodies reject unknown fields, including `id`, `userId`, all recording/creation/
update timestamps, raw snapshot fields, and `demoAccount`. Future create/update
operations can share these full-replacement business-field schemas; a PATCH
operation would need an explicit separate contract. Optional nullable inputs
(`note`, income category, and monthly payment) normalize to `undefined`.
For full replacement, absent/cleared optional values mean unset.

There is deliberately no public write schema for financial positions. Position
totals and recording times must be derived by future server mutation services.

## Ownership, recording times, and validation still required by future APIs

- Derive `userId` from Better Auth on the server, never from a request body.
- Resolve source account, destination account, and investment ownership before
  a mutation. Zod validates reference syntax; it cannot verify ownership or funds.
- Generate IDs and timestamps on creation. `balance` maps to `balanceSnapshot`
  and `value` maps to `valuationSnapshot`, each with a new server snapshot time.
- Preserve a transaction's original database `recordedAt` on edits. Do not use
  update time or transaction date in its place.
- Enforce sufficient funds, available investment value, deletion restrictions,
  concurrency control, and atomic position-history capture in later services.
- Scope rows to the current user before serialization. DTO conversion is pure
  and does not perform authentication or database access.

## Response DTOs and Prisma conversion

`types/finance-api.ts` reuses existing frontend types. `FinanceDataResponse` is
assignable to the existing store's `FinanceData`; its history array is required.
Transactions have required account IDs and type-specific references.
Position DTOs add the database snapshot ID. Ownership fields are not exposed.

`server/finance-dto.ts` provides pure, explicitly typed serializers for actual
Prisma model records. It imports Prisma types only and never instantiates the
client or reads connection configuration.

- Decimal values become numbers only after safe-representation checks.
- Database nulls become the frontend's optional values; JSON omits unset values.
- Recording, snapshot, creation, and update timestamps use UTC ISO strings.
- `@db.Date` becomes `YYYY-MM-DD` using UTC, without the host's local timezone.
  The inverse conversion validates the calendar and produces UTC midnight.
- Date-only requests accept MySQL's `1000-01-01` through `9999-12-31` range.
- Transaction serialization rejects inconsistent persisted relationship shapes.
- No computed current balance, current valuation, or net-worth column is added.

## Conservative transport decision, separate from existing arithmetic

The unused API schemas accept JSON numbers, matching existing numeric frontend
types. They reject amounts requiring rounding to two decimal places or exceeding
safe integer minor-unit representation. No string coercion or rounding occurs.
DTO serializers additionally verify the Decimal-to-number decimal round trip.

This deliberately supports less than the full `DECIMAL(18,2)` range. Full-range
support would require a different transport/arithmetic design, such as decimal
strings. This restriction applies only to the new contracts and does not change
current forms, store validation, persisted browser records, or calculations.

Confirm this boundary before activating future writes. Do not silently round
legacy JavaScript results to make them fit: `0.1 + 0.2` currently retains binary
floating-point error, and the new request guard rejects that value rather than
normalizing it. A business rounding rule remains unresolved.

## Characterized behavior and unresolved decisions

The tests distinguish confirmed invariants from current behavior that still
needs a product decision. No calculation implementation is changed.

| Topic | Current behavior | Decision still needed |
| --- | --- | --- |
| Snapshot cutoff | Only `recordedAt > snapshotAt` applies; equal timestamps are excluded. | How to order new operations that share a millisecond without losing an effect. |
| Transaction date | Ordinary totals use transaction dates; balances use recording timestamps. Backdated entries recorded after a snapshot affect its ledger. | Whether future-dated entries should continue affecting bank balances immediately. |
| Reporting dates | Overview comparisons are through today, while whole-month and category helpers include later dates in the current month. | Whether these views should share the same future-date policy. |
| Monthly boundary | Comparison periods and the previous-position cutoff use the browser's local calendar; date-only serialization is UTC. | Which business timezone a future server calculation should use. |
| Historical edits | Editing/deleting entries already covered by a replacement snapshot leaves that snapshot unchanged. | Confirm this policy for historical corrections before API mutation work. |
| Rounding | Existing ledger arithmetic uses unrounded JavaScript numbers and validation tolerates negatives down to approximately `-0.001`. | Business rounding, allowable precision, and whether to retain that tolerance. |

Transfers conserve newly moved bank value and never count as ordinary income or
expense. Purchases/sales exchange bank and tracked investment value, also outside
ordinary cash flow. Net worth is bank plus investments minus manually maintained
liabilities. Neither position-history totals nor earlier ledger effects are added
again to current snapshots. Debt payments do not automatically amortize principal.

## Verification

Use the existing Node test runner; no new dependencies are required:

```sh
node --test tests/finance-calculations.test.mjs tests/finance-comparisons.test.mjs
node --test tests/finance-contracts.test.mjs tests/finance-store.test.mjs
pnpm exec tsc --noEmit
pnpm lint
```

The store-action test uses an isolated in-memory `window.localStorage` fake.
Contract tests construct in-memory Prisma Decimal values without connecting to
MySQL. Date conversion is checked in both Asia/Kolkata and America/Los_Angeles.
The source-import test helper requires Node's `registerHooks` API (available in
the project's current Node 22.23 runtime).
