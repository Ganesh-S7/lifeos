# Typed Finance API client — Task 10

`src/features/finance/api/finance-api.ts` centralizes the existing Finance HTTP
endpoints. It is not connected to the store or UI. It does not read localStorage,
manage persistence, import server/Prisma code, show notifications, or retry writes.

## Methods and contracts

| Client method | Endpoint | Resolved value |
| --- | --- | --- |
| `getFinanceData()` | `GET /api/finance` | `FinanceDataResponse` |
| `createAccount(input)` | `POST /api/finance/accounts` | `BankAccountDto` |
| `updateAccount(id, input)` | `PUT /api/finance/accounts/[id]` | `BankAccountDto` |
| `deleteAccount(id)` | `DELETE /api/finance/accounts/[id]` | `void` |
| `createInvestment(input)` | `POST /api/finance/investments` | `InvestmentDto` |
| `updateInvestment(id, input)` | `PUT /api/finance/investments/[id]` | `InvestmentDto` |
| `deleteInvestment(id)` | `DELETE /api/finance/investments/[id]` | `void` |
| `createLiability(input)` | `POST /api/finance/liabilities` | `LiabilityDto` |
| `updateLiability(id, input)` | `PUT /api/finance/liabilities/[id]` | `LiabilityDto` |
| `deleteLiability(id)` | `DELETE /api/finance/liabilities/[id]` | `void` |
| `createTransaction(input)` | `POST /api/finance/transactions` | `FinanceTransactionDto` |
| `updateTransaction(id, input)` | `PUT /api/finance/transactions/[id]` | `FinanceTransactionDto` |
| `deleteTransaction(id)` | `DELETE /api/finance/transactions/[id]` | `void` |

Save envelopes (`{ account }`, `{ investment }`, `{ liability }`, `{ transaction }`)
are unwrapped, following the existing Health client convention. Deletes require
the exact affirmative `{ success: true }` contract before resolving to void.

The existing DTO definitions are reused. New schema-derived `BankAccountInput`,
`InvestmentInput`, `LiabilityInput`, and `FinanceTransactionInput` types live in
`types/finance-api.ts`. They use Zod's input inference through type-only imports.
This preserves actual JSON inputs such as nullable optional monthly payments,
income categories, and notes, while existing parsed server request types continue
to normalize nulls to undefined. No server schema or behavior changes are needed.

Transaction inputs retain all five discriminated shapes: income, expense,
transfer, investment purchase, and investment sale. Required categories and
destination/investment references remain specific to each variant. Ownership and
recording metadata are absent from the request types. TypeScript is not a security
boundary; the server still strictly validates every request and ownership relation.

## HTTP behavior

IDs use `encodeURIComponent`. Requests use relative same-origin paths and explicit
`credentials: "same-origin"`. Every call uses `cache: "no-store"`, complementing
the existing response `Cache-Control: private, no-store` headers. POST/PUT bodies
are JSON with the matching Content-Type header. GET/DELETE have no body.

Successful payloads must be JSON objects. Reads check that all five collections
are arrays; saves check their resource envelope; deletes require true success.
DTO fields remain typed according to the existing contract without duplicating
all server validation at runtime. Dates, timestamps, nullable/omitted fields, and
numeric money are transported without client-side coercion or financial arithmetic.

## Errors

All HTTP/protocol/network failures reject with `FinanceApiError`, containing
`message`, numeric `status`, and optional stable `code`.

- Expected 400, 401, 404, and 409 payloads with a stable error code retain the
  server's actionable message. Raw details/stack fields are not forwarded.
- 5xx, unknown error shapes, and non-JSON error bodies use operation-specific safe
  fallback messages. HTTP status and any valid machine error code remain available.
  Server/proxy diagnostic messages are not displayed, even if supplied as JSON.
- Invalid successful JSON/envelopes reject with `INVALID_RESPONSE` and the actual
  HTTP status; they do not become successful null/undefined values.
- Fetch failures reject with `NETWORK_ERROR` and status 0 (no HTTP response).
- JSON serialization failures reject with `INVALID_REQUEST` and status 0 before
  fetch, without exposing raw input values.

Callers decide how to display errors and when to notify; this module never emits
toasts, catches failures as success, retries requests, or mutates application state.

## Verification and limits

Run `node --test tests/finance-api-client.test.mjs` for mocked-fetch coverage of
all methods, envelopes, encoded IDs, request bodies, all transaction variants,
cache options, nullable fields, HTTP/protocol/network errors, and no runtime
dependencies. The module-load test rejects any runtime import by the client,
including notification libraries, schemas, server services, or Prisma.

`tests/finance-api-client.types.ts` contains compile-only assertions checked by
`pnpm exec tsc --noEmit`: valid nullable and variant inputs compile, public return
types match DTOs/void, and incompatible fields/ownership/metadata are rejected.
Its assertion function is never executed.

Tests do not make real HTTP requests or authenticate against Better Auth/MySQL.
Runtime response checks cover envelopes and read collection shapes, not every
individual DTO field. No endpoint mismatch requiring backend changes was found.
Store/UI integration and any later cancellation or field-error mapping remain
outside this task.
