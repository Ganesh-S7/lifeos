# Finance read API — Task 2

`GET /api/finance` returns the existing Task 1 `FinanceDataResponse`:

```json
{
  "accounts": [],
  "investments": [],
  "liabilities": [],
  "transactions": [],
  "positionHistory": []
}
```

The empty response above is returned when the authenticated user has no Finance
records. Reads do not insert a baseline, seed records, or consult browser storage.
There are no Finance write handlers or frontend/API-client integration in this task.

## Authentication and isolation

The route uses `auth.api.getSession({ headers: request.headers })`. Only
`session.user.id` is passed to the read service. Query-string identities are
ignored; request bodies are not read. All five Prisma `findMany` calls specify
`where: { userId }`, with no relation includes that could return another user's
account or investment. Serializers omit ownership fields from the response.

All five reads execute inside one `RepeatableRead` transaction, giving MySQL
consistent reads across the collections. No table writes are performed. The
service reuses the Task 1 serializers after the transaction completes.

## Ordering and serialization

- Accounts, investments, and liabilities: `createdAt ASC`, then `id ASC`.
- Transactions: `date DESC`, `recordedAt DESC`, then `id ASC`.
- Position history: `recordedAt ASC`, then `id ASC`.

The unique ID tie-breaker makes repeated responses deterministic. It does not
establish a new business ordering for ledger effects sharing a timestamp.
All records are returned; there is no pagination that could truncate the ledger.

DTO conversion retains snapshot/recording timestamps as UTC ISO strings and
transaction dates as `YYYY-MM-DD`. Prisma Decimal and null values follow the
existing contracts. Unrepresentable money or inconsistent persisted transaction
shapes fail through the generic error path rather than being silently rewritten.

## Responses and checks

The route uses the Node.js runtime, is dynamically evaluated, and returns
`Cache-Control: private, no-store` for success, unauthenticated, and error responses.

- `200`: `FinanceDataResponse`.
- `401`: `UNAUTHORIZED`, with a sign-in message.
- `500`: `INTERNAL_SERVER_ERROR`, with a generic loading message. Diagnostics
  are logged only on the server, without returning partial data or stack traces.

Run `node --test tests/finance-read.test.mjs` for route and query tests. They use
the actual handler, query service, NextResponse, and serializers with isolated
Better Auth and Prisma test doubles. They cover authentication outcomes, owner
filters, ordering clauses, serialization, empty data, and failure handling.

These tests do not connect to MySQL, authenticate real sessions, or prove live
database isolation under concurrent writes. Those remain integration checks for
an environment with explicitly provisioned test identities and data.
