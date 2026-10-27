# Expense categories

Categories are user-owned `ExpenseCategory` rows. Names are limited to 100 characters, normalized with NFKC and collapsed/trimmed whitespace, and compared by a lowercase key. The per-user unique key prevents duplicate creates, including competing requests. The key uses a binary MySQL collation so accents remain distinct; it allows up to 200 characters for lowercase Unicode expansion. Built-in labels are code-defined and remain available without seeding database rows.

`GET /api/finance/categories` returns built-ins, the authenticated user's saved categories, and historical expense labels. `POST` accepts only `{ name }`, requires the existing session and mutation-origin policy, and idempotently returns an owned category. No user IDs or foreign category IDs are accepted from clients. Categories remain available even if a draft is canceled or its expenses are later deleted.

The additive `20261028000000_expense_categories` migration creates the category table and adds a nullable transaction relationship. Its composite foreign key includes `userId`, preventing cross-user associations at the database boundary. The existing transaction `category` string remains the historical display label. No existing transactions are rewritten or backfilled. New/edited expenses link categories inside their existing Serializable ledger transaction, so failed mutations roll back category and position writes together. Unchanged historical category labels are retained on edit. Transaction DTOs and reporting continue to use category strings.

## Migration requirement

The migration was generated from before/after Prisma schemas and reviewed. On 2026-10-28 it was applied to the positively verified local `lifeos` development database, and the migration wrapper subsequently reported success for `migrate status`. Existing expense fields and labels were checked before and after migration and remained unchanged. No remote, Preview or Production database was migrated during this verification.

For another approved environment, apply it before running the new application version, using the existing verified-TLS wrapper:

```powershell
pnpm db:cli migrate deploy
```

Review the target environment and follow the existing production release process. Do not use direct database commands to bypass the wrapper. The migration is compatible with the old application, which can leave the new relationship null.

For a positively verified non-production loopback database, the established local workflow is `pnpm db:cli --local migrate status` followed by `pnpm db:cli --local migrate deploy`. Local mode retains the configured TLS policy and rejects remote hosts; do not change credentials or TLS settings to force a command through.

For an isolated loopback MySQL database with migrations already applied, the optional integration test exercises two real clients, duplicate-create races, persistence and the ownership foreign key:

```powershell
$env:LIFEOS_TEST_MYSQL_EXPENSE_CATEGORIES = "1"
node --test tests/expense-categories.mysql.test.mjs
```

It refuses hosted database URLs and never applies migrations itself. Normal tests use boundary substitutes; they do not establish live MySQL behavior.

The optional integration test cleans up its own synthetic records with deletes. Do not enable it when operating under a strict no-delete requirement. The 2026-10-28 local verification instead exercised real authenticated route handlers, independent MySQL clients and fresh Finance stores with isolated fixture owners whose records were retained. No database behavior was mocked. Existing expense editing was validated inside an intentional rollback, and a final count/hash check confirmed that all pre-existing expense fields and labels remained unchanged.

## Form behavior

There is no default/primary-account field or last-used-account preference in the existing model or UI. New expenses use the first available option, supplied in the server's creation-date/ID order. An account refresh only fills an untouched empty field; it never replaces a selection. Editing preserves the original account and category. New categories are not selected until explicitly chosen/created. Merchant remains required and maps to transaction `description`; Note remains optional and maps to transaction `note`.

Manual checks after migration: create and reuse a custom category across refreshes and dialogs; keyboard arrows/Enter/Escape; touch selection and scrolling with the keyboard open; both themes; category filters and spending charts; server failure and duplicate-create behavior.
