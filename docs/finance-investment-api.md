# Finance investment mutations — Task 6

Only backend investment writes are implemented. The Finance UI and its local
store are unchanged. No browser data is read, imported, merged, or seeded.

## Endpoint contracts

| Endpoint | Request | Success |
| --- | --- | --- |
| `POST /api/finance/investments` | `{ name: string, type: string, value: number }` | `201 { investment: InvestmentDto }` |
| `PUT /api/finance/investments/[id]` | Same full-replacement editable-field contract | `200 { investment: InvestmentDto }` |
| `DELETE /api/finance/investments/[id]` | Validated ID; no body required | `200 { success: true }` |

The existing strict `investmentRequestSchema` validates both create and PUT.
Names and types remain trimmed, non-empty free text up to 100 characters, so
Cryptocurrency and other investment types remain supported without a fixed enum.
Values must be non-negative JSON numbers within the existing safe-money range,
with at most two decimal places. Unknown properties, ownership, IDs, raw snapshot
fields, and generated timestamps are rejected. No coercion or rounding is added.

`toInvestmentDto` returns `id`, `name`, `type`, `valuationSnapshot`,
`valuationSnapshotAt`, `createdAt`, and `updatedAt`. Decimal conversion retains
the existing numeric DTO guard and ISO timestamp format. Ownership is omitted.
Prisma generates IDs and ordinary creation/update metadata.

All routes use Node.js, dynamic evaluation, and `Cache-Control: private, no-store`,
including error responses. `GET /api/finance` remains the only investment read
endpoint. No market quotes or automated valuations are introduced.

## Authentication and deletion

Better Auth receives the request headers. Only `session.user.id` supplies
ownership; query-string identities are ignored. Create explicitly selects allowed
fields. Update/delete queries and follow-up reads include both ID and user ID.
Foreign and missing records receive identical 404s.

Deletion checks ownership before looking for any transaction with the matching
`investmentId`, selecting only the reference ID. The reference query deliberately
does not filter transaction ownership: even an inconsistent cross-owner reference
must block deletion without exposing transaction details. Purchases, sales, or
any other persisted references prevent deletion. Transactions are not removed.

The ownership check, reference check, deletion, and position capture share one
Serializable transaction. Database Restrict foreign keys remain intact. A Prisma
`P2003` from investment deletion maps to the same 409 as a detected reference.
Other errors, including FK errors from history capture, retain generic handling.
No automatic retries are added for deadlocks or timeouts.

| Status | Error code | Meaning |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | Sign-in required |
| 400 | `INVALID_INPUT` | Invalid JSON, fields, or ID; flattened Zod details included |
| 404 | `NOT_FOUND` | Investment not found for the session user |
| 409 | `INVESTMENT_HAS_TRANSACTIONS` | Dependent transactions prevent deletion |
| 500 | `INTERNAL_SERVER_ERROR` | Generic failure; diagnostics logged server-side only |

The conflict message is: "This investment has transactions. Delete those
transactions first."

## Valuations and atomic financial positions

Create and PUT map `value` to a decimal-string `valuationSnapshot`, avoiding
floating-point calculations before persistence. `valuationSnapshotAt` comes from
the server clock inside the transaction. PUT refreshes the snapshot even for a
name/type edit through this full-replacement contract. ID, ownership, and creation
time are preserved.

Historical purchases and sales remain unchanged. The existing writer applies
their investment effects only if `recordedAt > valuationSnapshotAt`; equal-time
and earlier effects are already covered by the new valuation and excluded.
Transaction date is not substituted for recording time. Later purchases add
tracked value and later sales subtract it exactly once. Bank accounts retain
their independent snapshot cutoffs; manually revaluing an investment does not
generate a bank movement or rewrite bank history.

Every successful mutation calls the unchanged
`writeFinancialPosition(transaction, userId)` after applying its changes, inside
the same Serializable transaction used by account and liability services. It
retains account/valuation snapshot rules, income/expense/transfer/trade effects,
manual liability balances, exact integer-cent arithmetic, and DTO validation.
Net worth remains bank plus investments minus debt; it is not stored separately.

Mutation and history commit together or fail together. Failed, missing, or
blocked mutations append no history. Unrepresentable aggregate DTO values also
fail before commit. Successful zero valuations and final deletions capture the
resulting position; no initial demo or baseline is seeded. Prior history remains
unchanged. No calculations or position-writing logic are duplicated here.

## Verification and remaining limits

Run `node --test tests/finance-investments.test.mjs`. Tests import actual route
handlers, schemas, serializers, mutation service, and shared position writer.
External session and Prisma dependencies are mocked using the existing Node test
patterns. The Prisma double stages writes and publishes them only when the
transaction callback resolves.

Coverage includes authentication, ownership, validation, free-text investment
types, DTO mappings, server snapshot times, retained creation metadata, dependent
transactions, a simulated reference appearing before deletion, FK fallback,
error orchestration, and absence of retries. Ledger fixtures verify existing and
subsequent purchases/sales, bank effects, liability contribution to net worth,
strict cutoff equality, retained history, and replacement valuations without
double counting.

The simulated interleaving tests fallback handling, not simultaneous database
clients. No live MySQL instance or real Better Auth session was used. Actual
database FK enforcement, Serializable locking, concurrent operations, and rollback
still require provisioned integration tests.

Transaction CRUD, trade validation, transfer APIs, and frontend integration remain
outside this task. Equal-time ordering, future-date policy, historical correction
rules, and reporting time zones are not redefined. The existing strict recording
cutoff and independently timed snapshots are preserved.
