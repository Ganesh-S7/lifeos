# Finance liability mutations — Task 4

Only backend liability writes are implemented. The UI still uses the existing
local store. No browser records are read, imported, merged, or seeded.

## Endpoints

| Endpoint | Request | Success |
| --- | --- | --- |
| `POST /api/finance/liabilities` | Existing strict `liabilityRequestSchema` | `201 { liability: LiabilityDto }` |
| `PUT /api/finance/liabilities/[id]` | Same full-replacement editable-field contract | `200 { liability: LiabilityDto }` |
| `DELETE /api/finance/liabilities/[id]` | Validated ID; no body required | `200 { success: true }` |

Editable fields are `name`, `type`, `balance`, and optional `monthlyPayment`.
Null and omitted payments both map to database null, including clearing a payment
on PUT. Zero is retained. Responses omit null payments under the existing DTO
contract. Money accepts JSON numbers with at most two decimal places within the
existing safe numeric range; values requiring rounding are rejected.

All routes use Node.js, dynamic evaluation, and `Cache-Control: private, no-store`.
There are no additional GET endpoints. `GET /api/finance` remains unchanged.

## Authentication and errors

Better Auth receives the request headers. Only its authenticated `session.user.id`
is passed to the mutation service. Bodies reject unknown properties, including
IDs, ownership, and generated timestamps. Create fields are explicitly selected;
Prisma generates IDs and timestamps. Update and delete queries include both ID
and user ID; the follow-up update read also includes both.

- `401 { error: "UNAUTHORIZED", message }`: no authenticated session.
- `400 { error: "INVALID_INPUT", message, details }`: malformed JSON, invalid body,
  or invalid ID. Details use the existing Zod flattened-error convention.
- `404 { error: "NOT_FOUND", message: "Liability not found." }`: missing or foreign
  record; neither case reveals ownership.
- `500 { error: "INTERNAL_SERVER_ERROR", message }`: unexpected errors, logged on
  the server without returning diagnostics or partial results.

## Atomic position history

`mutateLiability` runs each change inside a Prisma interactive transaction with
explicit `Serializable` isolation, supported by the configured MySQL provider
and MariaDB driver adapter. All subsequent aggregate reads use that transaction.
Serializable range locking is selected to protect against concurrent aggregate
changes and phantom inserts. Deadlocks/timeouts fail through the generic 500
path and roll back; automatic retry and request idempotency are not added here.

After a successful write, `writeFinancialPosition(transaction, userId)` loads only
that user's accounts, investments, liabilities, and transactions. Later mutation
services can call this same helper after applying their changes inside a suitably
isolated transaction. It does not open or commit a separate transaction.

`calculateFinancialPosition` reproduces the existing ledger effects:

- An account starts at its balance snapshot. Income and investment sales add;
  expenses and investment purchases subtract. Transfers subtract from source and
  add to destination, subject to each account's independent snapshot cutoff.
- Investments start at valuation snapshots, then add purchases and subtract sales.
- Effects apply only when `recordedAt` is strictly greater than the relevant
  snapshot timestamp. Transaction date is not a ledger cutoff.
- Debt is the current sum of liability balances. Monthly payments are metadata;
  no principal amortization occurs.

Decimal inputs are converted exactly to BigInt cents after precision validation.
All summation uses integer arithmetic, then converts back to Decimal without
passing through JavaScript numbers. No rounding policy is introduced. The new
snapshot is serialized with the existing DTO guard inside the transaction;
out-of-range totals fail and roll back the mutation rather than persisting
history the read API cannot represent. Net worth remains bank plus investments
minus debt, derived from the three stored position fields.

Exactly one snapshot is appended per successful mutation, even for zero positions
or updates with unchanged values. Prior history is never summed into current
balances, overwritten, or regenerated. Failed/missing mutations append nothing.

## Preserved uncertainties and limits

Equal recording/snapshot timestamps remain excluded. Future-dated transactions
still affect the ledger when recorded. These existing behaviors are characterized,
not resolved here. Reporting time zones, historical correction policy, and business
ordering of same-time snapshots remain future product decisions. Database IDs and
recording timestamps retain their existing generated defaults.

Position capture reads the full ledger without pagination, matching current
calculations; very large ledgers may need a later optimization. Future account,
investment, and transaction writers must use compatible isolation/history capture
and enforce their own relationship ownership and ledger validation.

## Tests

Run `node --test tests/finance-liabilities.test.mjs`. It exercises actual handlers,
schemas, serializers, mutation service, and position writer. External session and
Prisma dependencies are mocked. The Prisma double stages writes and publishes
them only when the transaction callback succeeds; assertions cover transaction
orchestration and requested isolation, not actual database rollback or locking.
Pure tests compare ledger effects to the existing frontend helpers and verify
exact-cent arithmetic. No live MySQL instance or real Better Auth session is used.
