# Finance transaction mutations — Tasks 7–9

Backend-only transaction CRUD. The UI, custom local store, localStorage,
authentication configuration, and Prisma schema are unchanged. No browser data
is read/imported/seeded. All five existing transaction types now have write support.

## Contracts

| Endpoint | Success |
| --- | --- |
| `POST /api/finance/transactions` | `201 { transaction: FinanceTransactionDto }` |
| `PUT /api/finance/transactions/[id]` | `200 { transaction: FinanceTransactionDto }` |
| `DELETE /api/finance/transactions/[id]` | `200 { success: true }` |

POST and full-replacement PUT reuse `financeTransactionRequestSchema` for
`income`, `expense`, `transfer`, `investment_purchase`, and `investment_sale`. All require
positive numeric `amount`, non-empty `description`, valid calendar `date` in
`YYYY-MM-DD`, and an `accountId`. Expenses require `category`; income permits an
optional category. Transfers require a different `destinationAccountId` and reject
category and investment references, including null properties. Investment purchases
and sales require `investmentId` and reject category and destination account fields,
including null properties. Optional category/note inputs follow existing trimming and
null/omission normalization. Full replacement clears absent optional values to
database null. Unknown fields, IDs, ownership, recording/creation timestamps,
demo fields, and irrelevant relationship fields are rejected. Existing money
precision/range and MySQL date-range guards remain unchanged.

PUT keeps the original transaction type. The current Expenses editor always
submits `expense`, while the general transaction editor's type selector does not
offer expense; there is no existing income-to-expense or expense-to-income edit
flow. Transfers may be edited only as transfers. Income/expense entries cannot
become transfers, or vice versa. Purchases and sales can only be edited as the
same trade type; no type transitions among any of the five variants are permitted.

## Ownership and responses

Better Auth receives request headers. Only the session's user ID is used. Existing
transaction lookups, updates, and deletions include both ID and user ID. Missing
and foreign transactions produce identical 404s. Both the original and replacement
source accounts, and transfers' original and replacement destination accounts,
are checked for session ownership. Trades additionally validate ownership of
both the original and replacement investment, independently of account ownership.
Missing and foreign accounts/investments
receive the same validation response without exposing another user's data.

All routes use Node.js, dynamic evaluation, and `Cache-Control: private, no-store`.
The existing `GET /api/finance` remains the transaction read path.

| Status | Error code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_INPUT` | Invalid JSON/body/ID; flattened Zod details included |
| 400 | `INVALID_ACCOUNT` | Referenced account missing/not owned, or invalid persisted transfer account pair |
| 400 | `INVALID_INVESTMENT` | Referenced investment missing or not owned by the session user |
| 400 | `UNSUPPORTED_TRANSACTION_TYPE` | Defensive service rejection of an unknown persisted/runtime type; unknown request types fail schema validation |
| 400 | `TRANSACTION_TYPE_CHANGE_NOT_SUPPORTED` | Editing must retain the original type |
| 401 | `UNAUTHORIZED` | Sign-in required |
| 404 | `NOT_FOUND` | Transaction not found for this user |
| 409 | `NEGATIVE_BALANCE` | Proposed ledger violates a running bank or investment balance |
| 409 | `AMBIGUOUS_LEDGER_ORDER` | Equal recording times lack a defined order needed to validate funds |
| 500 | `INTERNAL_SERVER_ERROR` | Generic failure; diagnostics logged only on the server |

## Dates, recording time, and historical corrections

Creation omits ID and `recordedAt`, using their existing server database defaults.
PUT explicitly selects editable fields and omits `recordedAt`, ID, and ownership.
The original recording time is retained even when amount, date, or account changes.

`financeDateToDatabase` stores date-only inputs at UTC midnight for Prisma's
`@db.Date`; the serializer returns calendar strings without local-time conversion.
Transaction date determines reporting periods, not balance effects. The original
recording time is compared strictly against each relevant balance snapshot.

Effects at or before replacement snapshot times remain excluded when editing or
deleting historical entries. Submitted dates do not make these effects apply
again. Moving an entry to another account uses its original recording time against
that account's independent snapshot cutoff. Future-dated transactions still affect
the ledger when recorded, as characterized in earlier tasks. Historical correction
and reporting-timezone policies are not redefined.

## Ledger validation and atomic history

The mutation, proposed-ledger reads, running-balance validation, DTO serialization,
and existing position writer execute inside one Serializable Prisma transaction.
Failure at any stage rolls back staged changes. Rejected mutations do not write
history. Successful operations append exactly one resulting financial position.
No automatic retries are added for deadlocks or timeouts.

### Transfer writes

A transfer uses the existing endpoints and creates exactly one transaction row,
with its source in `accountId` and destination in `destinationAccountId`. ID and
`recordedAt` retain the server database defaults. Account balance snapshots are
never updated to reflect transfers. The shared ledger subtracts from the source
and adds to the destination, applying each account's independent strict snapshot
cutoff. When both effects apply, the transfer conserves combined bank assets.
When one effect is already included in a newer snapshot, it is not replayed.

Example request:

```json
{
  "type": "transfer",
  "accountId": "source-id",
  "destinationAccountId": "destination-id",
  "amount": 100,
  "description": "Move to savings",
  "date": "2026-10-01",
  "note": "Optional note"
}
```

Notes follow the existing optional/null/trim contract; PUT clears omitted notes.
Transfers never contribute to ordinary monthly income, expenses, cash flow,
savings rate, or category spending. Existing calculation helpers remain unchanged.

For PUT, the service validates ownership of all old and replacement source and
destination accounts, retains ID/userId/recordedAt, and applies the proposed
replacement ledger. It can change amount, date, description, note, and either
account while keeping type `transfer`. Deletion removes only the transfer row.
Both operations validate the resulting full running ledger before committing:
reducing, redirecting, or removing funds already spent by the original destination
can fail with `409 NEGATIVE_BALANCE`. Order-sensitive equal recording times retain
the existing `409 AMBIGUOUS_LEDGER_ORDER` response. All failures roll back the
mutation and append no position history.

### Investment purchase and sale writes

Both trade variants use the same three transaction endpoints. They require
`accountId` and `investmentId`, a positive `amount`, a non-empty `description`,
and a valid date-only `date`; `note` is optional with the existing null/omission
clearing and trimming behavior. Category and destination fields are not accepted.
For example:

```json
{
  "type": "investment_purchase",
  "accountId": "bank-id",
  "investmentId": "investment-id",
  "amount": 100,
  "description": "Purchase holding",
  "date": "2026-10-01"
}
```

Use `investment_sale` with the same field shape to record a sale. Each operation
creates exactly one ledger record. The shared ledger debits the bank and credits
the holding for a purchase, or credits the bank and debits the holding for a sale.
Neither operation directly updates account or investment snapshots. Financial
assets are conserved when both effects apply; independent snapshot timestamps
can mean one effect is already included and must not be replayed.

Trades never count as ordinary income/expense, cash flow, savings rate, or category
spending. Holding values remain manually maintained, not live market valuations.
There are no price feeds, unit quantities, profit/loss, or cost-basis calculations.

The service validates all old and replacement bank/investment relationships before
editing or deleting trades, and preserves ID, ownership, and original `recordedAt`.
Proposed ledger validation includes earlier purchases and sales, rather than only
checking the saved valuation. A purchase can fail because its bank lacks funds;
a sale can fail because tracked investment value is insufficient. Both return
`409 NEGATIVE_BALANCE` with the existing user-safe feedback.

Updates and deletions also validate downstream dependencies. Removing, reducing,
or moving a purchase can invalidate a later sale against the old holding. Removing,
reducing, or moving a sale's bank credit can invalidate a later expense against
the old bank. These failures commit nothing and append no history; related
accounts and investments are never cascade-deleted. Existing strict timestamp
cutoffs, absorbed historical effects, ambiguous-order conflicts, and Serializable
mutation/validation/history atomicity all apply unchanged.

`finance-ledger.ts` extracts the existing exact-cent conversion and per-transaction
effects from `finance-position.ts`. Both the unchanged position-writing workflow
and the new validator use these same effects, including existing transfers and
investment trades. No second monetary ledger calculation is introduced.

The validator checks all owned accounts and investments in recording-time order,
not just aggregate/final totals. It catches intermediate negative balances,
including removing/reducing income used by an earlier expense or transfer, and
moving entries between accounts. It retains each asset's independent strict
snapshot cutoff. With two-decimal money, the local store's `< -0.001` threshold
is exactly a balance below zero cents; no overdraft allowance or rounding policy
is introduced. The position writer continues to sum manually maintained debt
and use integer-cent arithmetic; net worth stays assets minus liabilities.

### Unresolved equal-time ordering

The local store's stable sort inherits its persisted array order for equal
`recordedAt` values. SQL has no equivalent insertion-order field. Using IDs or
transaction dates to decide financial order would introduce a new business rule.

The server therefore accepts a tied group only if its running balances are valid
regardless of the order within that group. A definitely negative group fails with
`NEGATIVE_BALANCE`. If the final group balance is valid but debits-before-credits
would make it negative, the request returns `AMBIGUOUS_LEDGER_ORDER` and commits
nothing. This explicit limitation needs a product decision on equal-time ordering;
the server does not guess an order or silently allow an uncertain ledger. Equality
with a balance snapshot itself remains excluded, exactly as before.

## Verification and limits

Run `node --test tests/finance-transactions.test.mjs tests/finance-transfers.test.mjs tests/finance-investment-transactions.test.mjs`.
Tests use actual handlers,
schemas, serializers, mutation service, shared ledger helpers, and position writer.
Auth and Prisma are replaced with existing-style test doubles. The in-memory
Prisma helper stages writes and publishes only a successful transaction callback.
It does not emulate live MySQL isolation, locks, FK enforcement or actual rollback.

Coverage includes session/account ownership, supported types and transitions,
strict validation, optional fields, date-only conversion, recording-time retention,
negative running balances, account moves, historical and equal-time cutoffs,
ambiguous ties, failure orchestration, existing transfers/trades, debt totals, and
comparison with the local store's prefix rules for distinct recording times.
Transfer tests additionally cover both account references, old/replacement
ownership, exact debits/credits, conserved total assets, cash-flow exclusion,
account moves, funding-dependent deletions, independent snapshot cutoffs, ambiguous
ties, and mutation/history failure orchestration. They use the same staged Prisma
double; none establish actual concurrent MySQL behavior.
Trade tests cover purchase/sale request variants, independent account/investment
ownership, old/replacement relationships, all type-transition restrictions,
bank/holding effects, complete-ledger sale availability, dependent deletions,
strict independent snapshot cutoffs, cash-flow exclusion, exact fractional money,
recording-time preservation, and mutation/entity-read/ledger-read/history failures.
They reuse the staged transaction helper with an owned-investment lookup double.
No real database records or Better Auth sessions were accessed.

Live database concurrency/rollback checks remain unverified. The full ledger is
read for validation and again by the existing position writer; optimizing large
ledgers is a later task. Frontend integration remains unimplemented here.
The local store retains its current
behavior, including browser-only demo history.
