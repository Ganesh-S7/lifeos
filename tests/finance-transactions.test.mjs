import "./helpers/register-typescript.mjs";
import { sameOriginHeaders } from "./helpers/mutation-request.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { Decimal } from "@prisma/client/runtime/client";
import { bank, database, entry, firstRecordedAt, holding, records, snapshotAt, userId } from "./helpers/finance-transaction-database.mjs";

const stateKey = "lifeos.transaction-tests.dependencies";
const dependencies = {};
globalThis[Symbol.for(stateKey)] = dependencies;
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "@/lib/auth" || specifier === "@/lib/prisma") {
            const source = specifier.endsWith("auth")
                ? `export const auth = { api: { getSession: (input) => globalThis[Symbol.for("${stateKey}")].getSession(input) } };`
                : `export const prisma = { $transaction: (...args) => globalThis[Symbol.for("${stateKey}")].database.client.$transaction(...args) };`;
            return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        }
        if (specifier === "@/features/finance/server/transaction-handler") {
            return nextResolve(new URL("../src/features/finance/server/transaction-handler.ts", import.meta.url).href, context);
        }
        if (specifier === "next/server") return nextResolve("next/server.js", context);
        return nextResolve(specifier, context);
    },
});

const collectionRoute = await import("../src/app/api/finance/transactions/route.ts");
const itemRoute = await import("../src/app/api/finance/transactions/[id]/route.ts");
const { mutateTransaction } = await import("../src/features/finance/server/transaction-mutations.ts");
const { validateFinanceLedger } = await import("../src/features/finance/server/finance-ledger.ts");
const { calculateFinancialPosition } = await import("../src/features/finance/server/finance-position.ts");
const { toFinanceDataResponse } = await import("../src/features/finance/server/finance-dto.ts");
const { accountBalance, investmentValue } = await import("../src/features/finance/utils/finance-calculations.ts");

const income = { type: "income", amount: 50.25, description: "Salary", date: "2026-10-01", accountId: "bank" };
const expense = { ...income, type: "expense", description: "Groceries", category: "Food" };

function setup(initial = records(), settings) {
    dependencies.database = database(initial, settings);
    dependencies.getSession = async () => ({ user: { id: userId } });
    return dependencies.database;
}

async function request(method, input = income, id = "owned", raw = false) {
    const req = new Request(`http://localhost/api/finance/transactions/${id}?userId=foreign`, {
        method,
        headers: sameOriginHeaders({ "Content-Type": "application/json", Cookie: "test-session" }),
        ...(method !== "DELETE" ? { body: raw ? input : JSON.stringify(input) } : {}),
    });
    const response = method === "POST" ? await collectionRoute.POST(req)
        : await itemRoute[method](req, { params: Promise.resolve({ id }) });
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    return { status: response.status, body: await response.json() };
}

function noHistory(db) {
    assert.equal(db.records.positionHistory.length, 0);
    assert.equal(db.calls.some((call) => call.method === "financialPositionSnapshot.create"), false);
}

test("routes expose only requested transaction mutations with dynamic Node configuration", () => {
    assert.deepEqual(Object.keys(collectionRoute).sort(), ["POST", "dynamic", "runtime"]);
    assert.deepEqual(Object.keys(itemRoute).sort(), ["DELETE", "PUT", "dynamic", "runtime"]);
    for (const route of [collectionRoute, itemRoute]) {
        assert.equal(route.runtime, "nodejs");
        assert.equal(route.dynamic, "force-dynamic");
    }
});

test("all methods authenticate before parsing or querying Finance", async () => {
    const db = setup();
    dependencies.getSession = async ({ headers }) => {
        assert.equal(headers.get("Cookie"), "test-session");
        return null;
    };
    for (const method of ["POST", "PUT", "DELETE"]) {
        const result = await request(method, "not JSON", "owned", true);
        assert.equal(result.status, 401);
        assert.equal(result.body.error, "UNAUTHORIZED");
    }
    assert.equal(db.options.length, 0);
});

test("create income and expense use session ownership, exact money and date-only DTOs", async () => {
    for (const input of [income, expense]) {
        const db = setup();
        const result = await request("POST", { ...input, description: ` ${input.description} ` });
        assert.equal(result.status, 201);
        assert.deepEqual(result.body.transaction, {
            ...input, id: "generated-1", recordedAt: "2022-01-01T00:00:00.000Z",
        });
        assert.equal(db.records.transactions[0].userId, userId);
        assert.equal(db.records.transactions[0].date.toISOString(), "2026-10-01T00:00:00.000Z");
        assert.equal(db.records.transactions[0].amount.toString(), "50.25");
        assert.deepEqual(db.options, [{ isolationLevel: "Serializable" }]);
        assert.equal(db.records.positionHistory[0].bank.toString(), input.type === "income" ? "150.25" : "49.75");
    }
});

test("missing/foreign accounts are rejected on create and replacement", async () => {
    for (const method of ["POST", "PUT"]) {
        for (const accountId of ["missing", "foreign"]) {
            const data = records();
            data.accounts.push(bank("foreign", { userId: "foreign" }));
            data.transactions = [entry()];
            const db = setup(data);
            const result = await request(method, { ...income, accountId });
            assert.equal(result.status, 400);
            assert.equal(result.body.error, "INVALID_ACCOUNT");
            assert.deepEqual(db.records.transactions, data.transactions);
            noHistory(db);
        }
    }
});

test("foreign/missing transaction IDs return the same 404 for update and deletion", async () => {
    for (const method of ["PUT", "DELETE"]) {
        for (const id of ["missing", "foreign"]) {
            const data = records();
            data.transactions = [entry("foreign", { userId: "foreign" })];
            const db = setup(data);
            assert.deepEqual(await request(method, income, id), {
                status: 404, body: { error: "NOT_FOUND", message: "Transaction not found." },
            });
            assert.deepEqual(db.records.transactions, data.transactions);
            noHistory(db);
        }
    }
});

test("strict contracts reject invalid amounts, dates, accounts, fields and recording metadata", async () => {
    const invalid = [
        {}, null, [], { ...income, amount: 0 }, { ...income, amount: -1 },
        { ...income, amount: 0.001 }, { ...income, amount: "5" }, { ...income, amount: 1e16 },
        { ...income, description: " " }, { ...income, description: "x".repeat(101) },
        { ...income, date: "2026-02-30" }, { ...income, date: "2026-10-01T00:00:00Z" },
        { ...income, date: "0999-01-01" }, { ...income, accountId: " " },
        { ...income, accountId: undefined }, { ...expense, category: undefined },
        { ...expense, category: "" }, { ...income, type: "unknown" },
        { ...income, note: "x".repeat(251) },
        ...["id", "userId", "recordedAt", "createdAt", "updatedAt", "demoAccount", "unexpected", "destinationAccountId", "investmentId"]
            .map((field) => ({ ...income, [field]: "forged" })),
    ];
    for (const method of ["POST", "PUT"]) {
        for (const input of invalid) {
            const db = setup();
            const result = await request(method, input);
            assert.equal(result.status, 400, JSON.stringify(input));
            assert.equal(result.body.error, "INVALID_INPUT");
            assert.equal(db.options.length, 0);
        }
        const db = setup();
        assert.equal((await request(method, "{broken", "owned", true)).status, 400);
        assert.equal(db.options.length, 0);
    }
});

test("unknown transaction types cannot be created, edited, deleted, or converted", async () => {
    for (const type of ["dividend", "unknown"]) {
        const body = { ...income, type };
        for (const method of ["POST", "PUT"]) {
            const db = setup();
            const result = await request(method, body);
            assert.equal(result.status, 400);
            assert.equal(result.body.error, "INVALID_INPUT");
            assert.equal(db.options.length, 0);
        }
        for (const method of ["PUT", "DELETE"]) {
            const data = records();
            data.transactions = [entry("owned", { type })];
            const db = setup(data);
            const result = await request(method);
            assert.equal(result.status, 400);
            assert.equal(result.body.error, "UNSUPPORTED_TRANSACTION_TYPE");
            noHistory(db);
        }
    }
});

test("income/expense type changes are rejected to match their separate UI edit flows", async () => {
    for (const [original, replacement] of [["income", expense], ["expense", income]]) {
        const data = records();
        data.transactions = [entry("owned", { type: original, category: original === "expense" ? "Food" : null })];
        const db = setup(data);
        const result = await request("PUT", replacement);
        assert.equal(result.status, 400);
        assert.equal(result.body.error, "TRANSACTION_TYPE_CHANGE_NOT_SUPPORTED");
        noHistory(db);
    }
});

test("invalid route identifiers fail before database mutations", async () => {
    for (const method of ["PUT", "DELETE"]) {
        for (const id of ["", " ", "x".repeat(192)]) {
            const db = setup();
            assert.equal((await request(method, income, id)).status, 400);
            assert.equal(db.options.length, 0);
        }
    }
});

test("income category and notes follow null/omission/trim semantics on full replacement", async () => {
    for (const optional of [{}, { category: null, note: null }, { category: " Salary ", note: " Note " }]) {
        const db = setup();
        const created = await request("POST", { ...income, ...optional });
        assert.equal(created.status, 201);
        assert.equal(created.body.transaction.category, optional.category ? "Salary" : undefined);
        assert.equal(created.body.transaction.note, optional.note ? "Note" : undefined);
        const updated = await request("PUT", income, created.body.transaction.id);
        assert.equal(updated.status, 200);
        assert.equal(updated.body.transaction.category, undefined);
        assert.equal(updated.body.transaction.note, undefined);
        assert.equal(db.records.transactions[0].category, null);
        assert.equal(db.records.transactions[0].note, null);
    }
});

test("income and expense edits preserve recordedAt and reporting-date changes do not retime effects", async () => {
    for (const [type, body, expected] of [["income", income, "125.25"], ["expense", expense, "74.75"]]) {
        const data = records();
        data.transactions = [entry("owned", { type, category: type === "expense" ? "Food" : null })];
        const db = setup(data);
        const result = await request("PUT", { ...body, amount: 25.25, date: "2010-01-01" });
        assert.equal(result.status, 200);
        assert.equal(result.body.transaction.recordedAt, firstRecordedAt.toISOString());
        assert.equal(result.body.transaction.date, "2010-01-01");
        assert.equal(result.body.transaction.id, "owned");
        assert.equal(db.records.transactions[0].userId, userId);
        assert.equal(db.records.positionHistory[0].bank.toString(), expected);
    }
});

test("oversized expenses on create or update roll back with 409 and no history", async () => {
    for (const method of ["POST", "PUT"]) {
        const data = records();
        if (method === "PUT") data.transactions = [entry("owned", { type: "expense", category: "Food" })];
        const db = setup(data);
        const result = await request(method, { ...expense, amount: 100.01 });
        assert.equal(result.status, 409);
        assert.equal(result.body.error, "NEGATIVE_BALANCE");
        assert.deepEqual(db.records.transactions, data.transactions);
        noHistory(db);
    }
});

test("deleting or reducing funding income is rejected even when a later income makes final totals positive", async () => {
    for (const method of ["PUT", "DELETE"]) {
        const data = records();
        data.accounts = [bank("bank", { balanceSnapshot: new Decimal("0") })];
        data.transactions = [
            entry(),
            entry("spent", { type: "expense", category: "Food", amount: new Decimal("40"), recordedAt: new Date("2021-02-01Z") }),
            entry("later", { amount: new Decimal("100"), recordedAt: new Date("2021-03-01Z") }),
        ];
        const db = setup(data);
        const result = await request(method, { ...income, amount: 10 });
        assert.equal(result.status, 409);
        assert.equal(result.body.error, "NEGATIVE_BALANCE");
        assert.deepEqual(db.records.transactions, data.transactions);
        noHistory(db);
    }
});

test("account reassignment validates both losing and receiving accounts", async () => {
    for (const type of ["income", "expense"]) {
        const data = records();
        data.accounts = [bank("bank", { balanceSnapshot: new Decimal(type === "income" ? "0" : "100") }), bank("other", { balanceSnapshot: new Decimal("0") })];
        data.transactions = [entry("owned", { type, category: type === "expense" ? "Food" : null })];
        if (type === "income") {
            data.transactions.push(entry("spent", { type: "expense", category: "Food", amount: new Decimal("40"), recordedAt: new Date("2021-02-01Z") }));
        }
        const db = setup(data);
        const result = await request("PUT", { ...(type === "income" ? income : expense), accountId: "other" });
        assert.equal(result.status, 409);
        noHistory(db);
    }
    const data = records();
    data.accounts.push(bank("other"));
    data.transactions = [entry("owned", { type: "expense", category: "Food" })];
    const db = setup(data);
    assert.equal((await request("PUT", { ...expense, amount: 10, accountId: "other" })).status, 200);
    assert.equal(db.records.transactions[0].accountId, "other");
    assert.equal(db.records.positionHistory[0].bank.toString(), "190");
    assert.deepEqual(db.calls.filter((call) => call.method === "bankAccount.findFirst").map((call) => call.query.where.id), ["bank", "other"]);
});

test("historical/equal-time edits and deletes leave the replacement bank snapshot unchanged", async () => {
    for (const recordedAt of [snapshotAt, new Date(snapshotAt.getTime() - 1)]) {
        for (const method of ["PUT", "DELETE"]) {
            const data = records();
            data.transactions = [entry("owned", { recordedAt, type: "expense", category: "Food" })];
            const db = setup(data);
            const result = await request(method, { ...expense, amount: 10000, date: "2099-01-01" });
            assert.equal(result.status, 200);
            assert.equal(db.records.positionHistory[0].bank.toString(), "100");
            if (method === "PUT") assert.equal(result.body.transaction.recordedAt, recordedAt.toISOString());
        }
    }
});

test("successful deletes reverse applicable income/expenses and retain related entities", async () => {
    for (const type of ["income", "expense"]) {
        const data = records();
        data.investments = [holding()];
        data.transactions = [entry("owned", { type, category: type === "expense" ? "Food" : null })];
        const db = setup(data);
        assert.deepEqual(await request("DELETE"), { status: 200, body: { success: true } });
        assert.equal(db.records.transactions.length, 0);
        assert.deepEqual(db.records.accounts, data.accounts);
        assert.deepEqual(db.records.investments, data.investments);
        assert.equal(db.records.positionHistory[0].bank.toString(), "100");
    }
});

test("mutation, ledger-read and position-write failures leave staged transaction changes uncommitted", async () => {
    const previousError = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args);
    let attempts = 0;
    try {
        for (const method of ["POST", "PUT", "DELETE"]) {
            const operation = method === "POST" ? "financeTransaction.create"
                : method === "PUT" ? "financeTransaction.updateMany" : "financeTransaction.deleteMany";
            for (const failAt of [operation, "bankAccount.findMany", "financialPositionSnapshot.create"]) {
                attempts++;
                const data = records();
                data.transactions = [entry()];
                const db = setup(data, { failAt });
                const result = await request(method);
                assert.equal(result.status, 500);
                assert.equal(result.body.error, "INTERNAL_SERVER_ERROR");
                assert.equal(JSON.stringify(result.body).includes("PRIVATE_DATABASE_DIAGNOSTIC"), false);
                assert.deepEqual(db.records.transactions, data.transactions);
                assert.equal(db.records.positionHistory.length, 0);
                assert.equal(db.options.length, 1);
                if (failAt !== "financialPositionSnapshot.create") noHistory(db);
            }
        }
        assert.equal(errors.length, attempts);
    } finally {
        console.error = previousError;
    }
});

test("existing transfers/trades and manual liabilities participate in validation and position capture", async () => {
    const data = records();
    data.accounts.push(bank("savings", { balanceSnapshot: new Decimal("0") }));
    data.investments = [holding()];
    data.liabilities = [{ id: "loan", userId, name: "Loan", type: "Loan", balance: new Decimal("20"), monthlyPayment: null, createdAt: snapshotAt, updatedAt: snapshotAt }];
    data.transactions = [
        entry("transfer", { type: "transfer", amount: new Decimal("10"), destinationAccountId: "savings" }),
        entry("purchase", { type: "investment_purchase", amount: new Decimal("5.10"), investmentId: "holding", recordedAt: new Date("2021-02-01Z") }),
        entry("sale", { type: "investment_sale", amount: new Decimal("2.20"), investmentId: "holding", recordedAt: new Date("2021-03-01Z") }),
    ];
    const db = setup(data);
    assert.equal((await request("POST", { ...income, amount: 0.10 })).status, 201);
    const position = db.records.positionHistory[0];
    assert.equal(position.bank.toString(), "97.2");
    assert.equal(position.investments.toString(), "102.9");
    assert.equal(position.debt.toString(), "20");
    assert.equal(position.bank.plus(position.investments).minus(position.debt).toString(), "180.1");
    assert.deepEqual(db.records.transactions.slice(0, 3), data.transactions);
});

test("removing income cannot invalidate an existing transfer's source balance", async () => {
    const data = records();
    data.accounts = [bank("bank", { balanceSnapshot: new Decimal("0") }), bank("savings", { balanceSnapshot: new Decimal("0") })];
    data.transactions = [entry(), entry("transfer", { type: "transfer", amount: new Decimal("40"), destinationAccountId: "savings", recordedAt: new Date("2021-02-01Z") })];
    const db = setup(data);
    assert.equal((await request("DELETE")).status, 409);
    noHistory(db);
});

test("auth failures and deadlocks remain generic errors without retry", async () => {
    const previousError = console.error;
    console.error = () => {};
    try {
        let db = setup();
        dependencies.getSession = async () => {
            throw new Error("PRIVATE_AUTH_DIAGNOSTIC");
        };
        for (const method of ["POST", "PUT", "DELETE"]) {
            const result = await request(method);
            assert.equal(result.status, 500);
            assert.equal(JSON.stringify(result.body).includes("PRIVATE_AUTH_DIAGNOSTIC"), false);
        }
        assert.equal(db.options.length, 0);
        db = setup(records(), { failAt: "financeTransaction.create", errorCode: "P2034" });
        assert.equal((await request("POST")).status, 500);
        assert.equal(db.options.length, 1);
    } finally {
        console.error = previousError;
    }
});

test("mutation service fails closed for empty authenticated identities", async () => {
    const db = setup();
    await assert.rejects(mutateTransaction(db.client, " ", { kind: "create", input: income }), /authenticated user/);
    assert.equal(db.options.length, 0);
});

test("prefix validator rejects temporary negatives and exact cent overdrafts", () => {
    const data = records();
    data.accounts[0].balanceSnapshot = new Decimal("0.30");
    data.transactions = [entry("expense", { type: "expense", category: "Food", amount: new Decimal("0.31") })];
    assert.throws(() => validateFinanceLedger(data), { code: "NEGATIVE_BALANCE" });
    data.transactions[0].amount = new Decimal("0.30");
    assert.doesNotThrow(() => validateFinanceLedger(data));
});

test("order-sensitive timestamp ties fail explicitly while order-independent ties are accepted", async () => {
    const data = records();
    data.accounts[0].balanceSnapshot = new Decimal("0");
    data.transactions = [entry(), entry("expense", { type: "expense", category: "Food", amount: new Decimal("40") })];
    assert.throws(() => validateFinanceLedger(data), { code: "AMBIGUOUS_LEDGER_ORDER" });
    assert.throws(() => validateFinanceLedger({ ...data, transactions: [...data.transactions].reverse() }), { code: "AMBIGUOUS_LEDGER_ORDER" });
    const db = setup(data);
    const result = await request("POST", income);
    assert.equal(result.status, 409);
    assert.equal(result.body.error, "AMBIGUOUS_LEDGER_ORDER");
    noHistory(db);
    data.accounts[0].balanceSnapshot = new Decimal("50");
    assert.doesNotThrow(() => validateFinanceLedger(data));
});

test("investment running values and independent valuation cutoffs use the same effects as aggregation", () => {
    const data = records();
    data.investments = [holding("holding", { valuationSnapshot: new Decimal("0") })];
    data.transactions = [entry("sale", { type: "investment_sale", amount: new Decimal("1"), investmentId: "holding" })];
    assert.throws(() => validateFinanceLedger(data), { code: "NEGATIVE_BALANCE" });
    data.investments[0].valuationSnapshotAt = firstRecordedAt;
    assert.doesNotThrow(() => validateFinanceLedger(data));
    assert.equal(calculateFinancialPosition(data).investments.toString(), "0");
    assert.equal(calculateFinancialPosition(data).bank.toString(), "101");
});

test("extracted exact running validation agrees with the local store's prefix rules for distinct timestamps", () => {
    function frontendAccepts(data) {
        const dto = toFinanceDataResponse(data);
        const ordered = [...dto.transactions].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
        for (const account of dto.accounts) {
            let balance = account.balanceSnapshot;
            for (const item of ordered) {
                if (item.recordedAt <= account.balanceSnapshotAt) continue;
                balance = accountBalance({ ...account, balanceSnapshot: balance, balanceSnapshotAt: "" }, [item]);
                if (balance < -0.001) return false;
            }
        }
        for (const investment of dto.investments) {
            let value = investment.valuationSnapshot;
            for (const item of ordered) {
                if (item.recordedAt <= investment.valuationSnapshotAt) continue;
                value = investmentValue({ ...investment, valuationSnapshot: value, valuationSnapshotAt: "" }, [item]);
                if (value < -0.001) return false;
            }
        }
        return true;
    }
    for (const opening of [0, 10, 100]) {
        for (const amount of [1, 10, 100]) {
            const data = records();
            data.accounts[0].balanceSnapshot = new Decimal(opening);
            data.accounts.push(bank("savings"));
            data.investments = [holding("holding", { valuationSnapshot: new Decimal(opening) })];
            data.transactions = [
                entry("income", { amount: new Decimal("5") }),
                entry("expense", { type: "expense", category: "Food", amount: new Decimal(amount), recordedAt: new Date("2021-02-01T00:00:00Z") }),
                entry("transfer", { type: "transfer", destinationAccountId: "savings", amount: new Decimal(amount), recordedAt: new Date("2021-03-01T00:00:00Z") }),
                entry("purchase", { type: "investment_purchase", investmentId: "holding", amount: new Decimal(amount), recordedAt: new Date("2021-04-01T00:00:00Z") }),
                entry("sale", { type: "investment_sale", investmentId: "holding", amount: new Decimal(amount * 2), recordedAt: new Date("2021-05-01T00:00:00Z") }),
            ];
            if (frontendAccepts(data)) assert.doesNotThrow(() => validateFinanceLedger(data));
            else assert.throws(() => validateFinanceLedger(data), { code: "NEGATIVE_BALANCE" });
        }
    }
});
