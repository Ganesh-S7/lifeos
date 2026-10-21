# Finance mutation readiness

Finance still uses the existing synchronous local store. Every UI caller awaits
its action so a later implementation can return a promise without changing the
dialog completion sequence. No API writes or persistence changes are included.

## Completion contract

`FinanceMutationCallback<T>` returns `boolean | Promise<boolean>`. Only `true`
confirms success. `false` leaves the dialog open; a rejected callback also leaves
it open and exposes error feedback. Expense saves own their notifications in the
page handler. The expense dialog owns completion and unexpected rejection
feedback, avoiding duplicate notifications for handled failures.

`createFinanceMutation` provides an immediate lock and awaits completion before
calling success feedback. `useFinanceMutation` exposes that lock alongside React
pending state. Save forms keep their React Hook Form values after failure and
disable their fieldsets, submit buttons, and cancellation while pending. Dialog
open-change handlers block dismissal. Delete dialogs use the existing
`DeleteModal.isLoading` convention and retain their targets after failure.

## Covered workflows

- Account, investment, and liability creation and editing: `FinanceManager`.
- Income, transfer, investment purchase/sale creation and editing: `FinanceManager`.
- Account, investment, liability, and recent transaction deletion: `FinanceOverview`.
- Expense creation/editing: `AddExpenseDialog` and the Expenses page save handler.
- Expense deletion: the Expenses page confirmation handler.

`ManageFinancesDialog` callbacks only open editors or delete confirmations; they
do not perform mutations and retain their synchronous signatures.

## Verification and limits

`node --test tests/finance-mutations.test.mjs` exercises the shared coordinator
with deferred promises, rejected promises, false results, synchronous operations,
retries, and duplicate attempts. Success callbacks model notification and dialog
completion. These are utility tests, not mounted React or browser tests; actual
form rendering, field preservation, and dismissal interactions are not automated
by the current test setup.

The store actions remain synchronous intentionally. Their existing behavior when
localStorage writes fail is unchanged; durable server writes and their error
contracts belong to a later integration task.
