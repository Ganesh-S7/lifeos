# Finance bank account mutations — Task 5

Backend account writes only. Finance pages and forms still use the existing local
store. No localStorage records are read, imported, merged, or seeded.

## Contracts

| Endpoint | Request | Success |
| --- | --- | --- |
| `POST /api/finance/accounts` | `{ name: string, balance: number }` | `201 { account: BankAccountDto }` |
| `PUT /api/finance/accounts/[id]` | Same full-replacement editable-field contract | `200 { account: BankAccountDto }` |
| `DELETE /api/finance/accounts/[id]` | Validated ID; no body required | `200 { success: true }` |

The existing strict `bankAccountRequestSchema` trims names and requires a
non-negative numeric balance with supported two-decimal precision and range.
Missing and unknown fields, ownership, IDs, raw snapshots, and generated
timestamps are rejected. No coercion or financial rounding is added.

The existing `toBankAccountDto` serializer returns `id`, `name`,
`balanceSnapshot`, `balanceSnapshotAt`, `createdAt`, and `updatedAt`. Money is a
guarded JSON number; timestamps are ISO strings. Ownership is omitted.

Each route uses Node.js, dynamic evaluation, and `Cache-Control: private, no-store`
on all responses. The existing `GET /api/finance` remains the account read path.

## Ownership, deletion, and errors

Better Auth receives request headers. `session.user.id` supplies the only accepted
ownership identity; query-string identities are ignored. Create explicitly selects
editable fields and session ownership. Update and delete queries include both the
record ID and user ID. Missing and foreign records return the same 404 response.

Deletion first finds the owned account, then looks for any transaction referencing
its `accountId` or `destinationAccountId`. Only the reference ID is selected.
This reference check intentionally has no user filter: even an inconsistent
cross-owner reference must prevent deletion, with no transaction details exposed.

The reference check, deletion, and history capture run in the same Serializable
transaction. Existing database `Restrict` foreign keys remain intact. A `P2003`
from the account deletion itself maps to the same conflict as a detected
reference, covering the fallback when a reference prevents deletion after the
application check. Transactions are never deleted or rewritten.

| Status | Error code | Meaning |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | Sign-in required |
| 400 | `INVALID_INPUT` | Invalid JSON, fields, or ID; flattened Zod details included |
| 404 | `NOT_FOUND` | Bank account not found for the session user |
| 409 | `ACCOUNT_HAS_TRANSACTIONS` | Delete or move dependent transactions first |
| 500 | `INTERNAL_SERVER_ERROR` | Generic failure; diagnostics logged server-side only |

The 409 message is: "This account has transactions. Delete or move those
transactions first." FK errors outside account deletion are not misclassified as
account-reference conflicts. Deadlocks and timeouts retain the established
generic failure behavior; no automatic retries are introduced.

## Snapshots and atomic history

Create and PUT map `balance` to `balanceSnapshot` as a decimal string without
arithmetic through JavaScript floating point. `balanceSnapshotAt` is set from the
server clock inside the mutation transaction. Prisma supplies IDs and ordinary
creation/update metadata; PUT preserves ID, ownership, and creation time.

A balance edit establishes a replacement snapshot, including for name edits
submitted through the full PUT contract. Historical transactions remain unchanged.
The existing position writer applies only effects with `recordedAt` strictly
later than each account's snapshot. Older and equal-time entries are excluded;
transaction date is not used for this cutoff. Other accounts and investments keep
their own independent cutoffs.

`mutateAccount` reuses `writeFinancialPosition(transaction, userId)` after each
successful create, update, or deletion, with the same Serializable isolation as
liability mutations. This writer retains integer-cent arithmetic, investment
snapshot rules, transfer and trade effects, manually maintained debt, and DTO
range validation. No second balance-calculation implementation is added.

Mutation and history either commit together or fail together. Failed, missing,
or blocked mutations append no history. A final account deletion records the
remaining position, including zero assets when appropriate. Prior snapshots are
retained. No separate baseline is seeded.

## Verification and limits

Run `node --test tests/finance-accounts.test.mjs`. It exercises the actual routes,
validation, DTOs, mutation service, and shared position writer with external auth
and Prisma dependencies replaced by test doubles. Staged writes are published
only when the mocked transaction callback succeeds.

Tests cover ownership, request validation, response/cache contracts, server
snapshot times, preserved metadata and ledger records, strict cutoffs, exact
position totals, dependency checks, simulated reference creation between check
and deletion, FK fallback, failure orchestration, and absence of retries.

The simulated interleaving tests the service's fallback behavior. It does not
verify actual simultaneous clients, MySQL gap/row locks, FK enforcement, transaction
rollback, or live Better Auth sessions. No live database was accessed or populated.

Existing questions about timestamp ties, server/browser clock differences,
historical corrections, and reporting time zones remain unresolved and unchanged.
Future transaction writers must enforce relationship ownership and use compatible
transaction/history conventions; they are outside this task.
