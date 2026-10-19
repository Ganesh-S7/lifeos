import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { Decimal } from "@prisma/client/runtime/client";
import {
    bank,
    database,
    entry,
    firstRecordedAt,
    records,
    userId,
} from "./helpers/finance-transaction-database.mjs";

const stateKey = "lifeos.transfer-tests.dependencies";
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
const { createLedgerBalances, applyLedgerTransaction, decimalFromMinorUnits } = await import("../src/features/finance/server/finance-ledger.ts");
const { toFinanceDataResponse } = await import("../src/features/finance/server/finance-dto.ts");
const { monthlyActivity, categorySpending } = await import("../src/features/finance/utils/finance-calculations.ts");

const transfer = {
    type: "transfer", amount: 50.25, description: "Move to savings", date: "2026-10-01",
    accountId: "bank", destinationAccountId: "destination",
};

function transferRecords(withTransfer = false) {
    const data = records();
    data.accounts.push(bank("destination", { balanceSnapshot: new Decimal("0") }));
    if (withTransfer) {
        data.transactions = [entry("owned", {
            type: "transfer", amount: new Decimal("50"), destinationAccountId: "destination",
        })];
    }
    return data;
}

function setup(initial = transferRecords(), settings) {
    dependencies.database = database(initial, settings);
    dependencies.getSession = async () => ({ user: { id: userId } });
    return dependencies.database;
}

async function request(method, input = transfer, id = "owned", raw = false) {
    const req = new Request(`http://localhost/api/finance/transactions/${id}?userId=foreign`, {
        method,
        headers: { "Content-Type": "application/json", Cookie: "test-session" },
        ...(method !== "DELETE" ? { body: raw ? input : JSON.stringify(input) } : {}),
    });
    const response = method === "POST" ? await collectionRoute.POST(req)
        : await itemRoute[method](req, { params: Promise.resolve({ id }) });
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    return { status: response.status, body: await response.json() };
}

function assertBalances(db, expected) {
    const balances = createLedgerBalances(db.records);
    for (const transaction of db.records.transactions) applyLedgerTransaction(balances, transaction);
    for (const [id, value] of Object.entries(expected)) {
        assert.equal(decimalFromMinorUnits(balances.accounts.get(id).value).toString(), value, id);
    }
}

function assertUnchanged(db, original, noSnapshotAttempt = true) {
    assert.deepEqual(db.records, original);
    if (noSnapshotAttempt) {
        assert.equal(db.calls.some((call) => call.method === "financialPositionSnapshot.create"), false);
    }
}

test("all transfer mutations require authentication before parsing or querying Finance", async () => {
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

test("create stores one session-owned transfer and conserves bank assets without updating snapshots", async () => {
    const original = transferRecords();
    const db = setup(original);
    const result = await request("POST");
    assert.deepEqual(result, {
        status: 201,
        body: { transaction: { ...transfer, id: "generated-1", recordedAt: "2022-01-01T00:00:00.000Z" } },
    });
    assert.equal(db.records.transactions.length, 1);
    const row = db.records.transactions[0];
    assert.equal(row.userId, userId);
    assert.equal(row.accountId, "bank");
    assert.equal(row.destinationAccountId, "destination");
    assert.equal(row.investmentId, null);
    assert.equal(row.category, null);
    assert.equal(row.date.toISOString(), "2026-10-01T00:00:00.000Z");
    assertBalances(db, { bank: "49.75", destination: "50.25" });
    assert.deepEqual(db.records.accounts, original.accounts);
    assert.deepEqual(db.options, [{ isolationLevel: "Serializable" }]);
    assert.equal(db.calls.filter((call) => call.method === "financeTransaction.create").length, 1);
    assert.equal(db.records.positionHistory.length, 1);
    assert.equal(db.records.positionHistory[0].bank.toString(), "100");
});

test("transfer fields remain strict on create and update", async () => {
    const invalid = [
        { ...transfer, accountId: undefined }, { ...transfer, accountId: " " },
        { ...transfer, destinationAccountId: undefined }, { ...transfer, destinationAccountId: " " },
        { ...transfer, destinationAccountId: "bank" }, { ...transfer, destinationAccountId: null },
        { ...transfer, amount: -1 }, { ...transfer, amount: 0 }, { ...transfer, amount: 0.001 },
        { ...transfer, amount: "10" }, { ...transfer, amount: 1e16 },
        { ...transfer, date: "2026-02-30" }, { ...transfer, date: "2026-10-01T00:00:00Z" },
        { ...transfer, description: " " }, { ...transfer, note: "x".repeat(251) },
        ...["id", "userId", "recordedAt", "createdAt", "updatedAt", "investmentId", "category", "unknown"]
            .map((field) => ({ ...transfer, [field]: "forged" })),
        { ...transfer, category: null }, { ...transfer, investmentId: null },
    ];
    for (const method of ["POST", "PUT"]) {
        for (const input of invalid) {
            const db = setup();
            const result = await request(method, input);
            assert.equal(result.status, 400, JSON.stringify(input));
            assert.equal(result.body.error, "INVALID_INPUT");
            assert.equal(db.options.length, 0);
        }
    }
});

test("both source and destination must exist and belong to the session user", async () => {
    for (const method of ["POST", "PUT"]) {
        for (const field of ["accountId", "destinationAccountId"]) {
            for (const id of ["missing", "foreign"]) {
                const original = transferRecords(true);
                original.accounts.push(bank("foreign", { userId: "foreign" }));
                const db = setup(original);
                const result = await request(method, { ...transfer, [field]: id });
                assert.equal(result.status, 400);
                assert.equal(result.body.error, "INVALID_ACCOUNT");
                assertUnchanged(db, original);
            }
        }
    }
});

test("transfer update and delete cannot target missing or foreign transactions", async () => {
    for (const method of ["PUT", "DELETE"]) {
        for (const id of ["missing", "foreign"]) {
            const original = transferRecords();
            original.transactions = [entry("foreign", { userId: "foreign", type: "transfer", destinationAccountId: "destination" })];
            const db = setup(original);
            assert.deepEqual(await request(method, transfer, id), {
                status: 404, body: { error: "NOT_FOUND", message: "Transaction not found." },
            });
            assertUnchanged(db, original);
            assert.equal(db.calls.some((call) => call.method === "bankAccount.findFirst"), false);
        }
    }
});

test("old transfer relationships are validated before replacement or deletion", async () => {
    for (const method of ["PUT", "DELETE"]) {
        for (const field of ["accountId", "destinationAccountId"]) {
            for (const oldId of ["missing", "foreign"]) {
                const original = transferRecords(true);
                original.accounts.push(bank("foreign", { userId: "foreign" }));
                original.transactions[0][field] = oldId;
                const db = setup(original);
                const result = await request(method);
                assert.equal(result.status, 400);
                assert.equal(result.body.error, "INVALID_ACCOUNT");
                assertUnchanged(db, original);
            }
        }
        for (const destinationAccountId of [null, "bank"]) {
            const original = transferRecords(true);
            original.transactions[0].destinationAccountId = destinationAccountId;
            const db = setup(original);
            assert.equal((await request(method)).body.error, "INVALID_ACCOUNT");
            assertUnchanged(db, original);
        }
    }
});

test("transfer creates cannot overdraw their source", async () => {
    const original = transferRecords();
    const db = setup(original);
    const result = await request("POST", { ...transfer, amount: 100.01 });
    assert.equal(result.status, 409);
    assert.equal(result.body.error, "NEGATIVE_BALANCE");
    assertUnchanged(db, original);
});

test("transfer edits retain identity/recording time and replace amount/date/description/note", async () => {
    const original = transferRecords(true);
    const db = setup(original);
    const input = { ...transfer, amount: 25.10, date: "2010-03-02", description: " Revised transfer ", note: " Note " };
    const result = await request("PUT", input);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.transaction, {
        ...input, description: "Revised transfer", note: "Note", id: "owned", recordedAt: firstRecordedAt.toISOString(),
    });
    assert.equal(db.records.transactions[0].userId, userId);
    assertBalances(db, { bank: "74.9", destination: "25.1" });
    assert.deepEqual(db.records.accounts, original.accounts);
    assert.equal(db.records.positionHistory[0].bank.toString(), "100");
    const update = db.calls.find((call) => call.method === "financeTransaction.updateMany");
    assert.equal("recordedAt" in update.query.data, false);
    assert.equal("id" in update.query.data, false);
    assert.equal("userId" in update.query.data, false);
});

test("source and destination replacements validate all involved accounts and recalculate one transfer", async () => {
    for (const field of ["accountId", "destinationAccountId"]) {
        const original = transferRecords(true);
        original.accounts.push(bank("third"));
        const db = setup(original);
        assert.equal((await request("PUT", { ...transfer, amount: 25, [field]: "third" })).status, 200);
        assert.equal(db.records.transactions.length, 1);
        assertBalances(db, field === "accountId"
            ? { bank: "100", destination: "25", third: "75" }
            : { bank: "75", destination: "0", third: "125" });
        const checked = db.calls.filter((call) => call.method === "bankAccount.findFirst");
        assert.deepEqual(checked.map((call) => call.query.where.id), ["bank", "destination", "third"]);
        assert.ok(checked.every((call) => call.query.where.userId === userId));
        assert.equal(db.records.positionHistory[0].bank.toString(), "200");
        assert.deepEqual(db.records.accounts, original.accounts);
    }
});

test("transfer deletion reverses both effects without changing accounts or unrelated transactions", async () => {
    const original = transferRecords(true);
    original.transactions.push(entry("income", { amount: new Decimal("5"), recordedAt: new Date("2021-02-01T00:00:00Z") }));
    const db = setup(original);
    assert.deepEqual(await request("DELETE"), { status: 200, body: { success: true } });
    assertBalances(db, { bank: "105", destination: "0" });
    assert.deepEqual(db.records.accounts, original.accounts);
    assert.deepEqual(db.records.transactions, [original.transactions[1]]);
    assert.equal(db.records.positionHistory.length, 1);
    assert.equal(db.records.positionHistory[0].bank.toString(), "105");
});

test("deleting, reducing or redirecting funding transfers validates the old destination ledger", async () => {
    const changes = [
        ["DELETE", transfer],
        ["PUT", { ...transfer, amount: 10 }],
        ["PUT", { ...transfer, destinationAccountId: "third" }],
    ];
    for (const [method, input] of changes) {
        const original = transferRecords(true);
        original.accounts.push(bank("third"));
        original.transactions.push(entry("spent", {
            type: "expense", category: "Food", accountId: "destination", amount: new Decimal("40"),
            recordedAt: new Date("2021-02-01T00:00:00Z"),
        }));
        const db = setup(original);
        const result = await request(method, input);
        assert.equal(result.status, 409);
        assert.equal(result.body.error, "NEGATIVE_BALANCE");
        assertUnchanged(db, original);
    }
});

test("amount increases and source replacement cannot violate running source balances", async () => {
    for (const input of [{ ...transfer, amount: 100.01 }, { ...transfer, accountId: "third" }]) {
        const original = transferRecords(true);
        original.accounts.push(bank("third", { balanceSnapshot: new Decimal("0") }));
        const db = setup(original);
        const result = await request("PUT", input);
        assert.equal(result.status, 409);
        assert.equal(result.body.error, "NEGATIVE_BALANCE");
        assertUnchanged(db, original);
    }
});

test("transfers do not change ordinary income/expense, cash flow, savings rate or category totals", async () => {
    const original = transferRecords();
    original.transactions = [
        entry("income", { amount: new Decimal("10") }),
        entry("expense", { type: "expense", category: "Food", amount: new Decimal("5"), recordedAt: new Date("2021-02-01T00:00:00Z") }),
    ];
    const db = setup(original);
    const before = toFinanceDataResponse(original);
    const expectedActivity = { income: 10, expenses: 5, netCashFlow: 5, savingsRate: 50 };
    assert.deepEqual(monthlyActivity(before.transactions, "2026-10"), expectedActivity);
    const created = await request("POST");
    assert.equal(created.status, 201);
    const after = toFinanceDataResponse(db.records);
    assert.deepEqual(monthlyActivity(after.transactions, "2026-10"), expectedActivity);
    assert.deepEqual(categorySpending(after.transactions, "2026-10"), categorySpending(before.transactions, "2026-10"));
    assert.equal(db.records.positionHistory[0].bank.toString(), "105");
    const emptyDb = setup();
    assert.equal((await request("POST")).status, 201);
    assert.deepEqual(monthlyActivity(toFinanceDataResponse(emptyDb.records).transactions, "2026-10"), {
        income: 0, expenses: 0, netCashFlow: 0, savingsRate: null,
    });
});

test("type changes involving transfers and ordinary transactions remain rejected", async () => {
    for (const [originalType, replacementType] of [
        ["transfer", "income"], ["transfer", "expense"], ["income", "transfer"], ["expense", "transfer"],
    ]) {
        const original = transferRecords();
        original.transactions = [entry("owned", {
            type: originalType,
            destinationAccountId: originalType === "transfer" ? "destination" : null,
            category: originalType === "expense" ? "Food" : null,
        })];
        const db = setup(original);
        const input = replacementType === "transfer" ? transfer : {
            type: replacementType, amount: 10, description: "Changed", date: "2026-10-01", accountId: "bank",
            ...(replacementType === "expense" ? { category: "Food" } : {}),
        };
        const result = await request("PUT", input);
        assert.equal(result.status, 400);
        assert.equal(result.body.error, "TRANSACTION_TYPE_CHANGE_NOT_SUPPORTED");
        assertUnchanged(db, original);
    }
});

test("investment trade writes remain rejected on transfer paths", async () => {
    for (const type of ["investment_purchase", "investment_sale"]) {
        const original = transferRecords(true);
        const db = setup(original);
        const input = { type, amount: 10, description: "Trade", date: "2026-10-01", accountId: "bank", investmentId: "holding" };
        for (const method of ["POST", "PUT"]) {
            const result = await request(method, input);
            assert.equal(result.status, 400);
            assert.equal(result.body.error, "UNSUPPORTED_TRANSACTION_TYPE");
        }
        assert.equal(db.options.length, 0);
        assertUnchanged(db, original);
    }
});

test("strict snapshot cutoffs apply independently to each transfer account", async () => {
    const original = transferRecords();
    original.accounts[1].balanceSnapshot = new Decimal("50");
    original.accounts[1].balanceSnapshotAt = firstRecordedAt;
    const db = setup(original, { recordedAt: firstRecordedAt });
    assert.equal((await request("POST", { ...transfer, amount: 50 })).status, 201);
    assertBalances(db, { bank: "50", destination: "50" });
    assert.equal(db.records.positionHistory[0].bank.toString(), "100");
    assert.deepEqual(db.records.accounts, original.accounts);
});

test("historical transfer edits/deletes do not replay effects covered by newer snapshots", async () => {
    for (const cutoff of [firstRecordedAt, new Date(firstRecordedAt.getTime() + 1)]) {
        for (const method of ["PUT", "DELETE"]) {
            const original = transferRecords(true);
            original.accounts.forEach((account) => {
                account.balanceSnapshotAt = cutoff;
            });
            const db = setup(original);
            const result = await request(method, { ...transfer, amount: 10000, date: "2099-01-01" });
            assert.equal(result.status, 200);
            assertBalances(db, { bank: "100", destination: "0" });
            assert.equal(db.records.positionHistory[0].bank.toString(), "100");
            if (method === "PUT") assert.equal(result.body.transaction.recordedAt, firstRecordedAt.toISOString());
        }
    }
});

test("transfer validation preserves order-sensitive timestamp conflicts", async () => {
    for (const opening of [0, 100]) {
        const original = transferRecords();
        original.accounts[0].balanceSnapshot = new Decimal(opening);
        original.transactions = [entry("income", { amount: new Decimal("100") })];
        const db = setup(original, { recordedAt: firstRecordedAt });
        const result = await request("POST");
        if (opening === 0) {
            assert.equal(result.status, 409);
            assert.equal(result.body.error, "AMBIGUOUS_LEDGER_ORDER");
            assertUnchanged(db, original);
        } else {
            assert.equal(result.status, 201);
            assertBalances(db, { bank: "149.75", destination: "50.25" });
        }
    }
});

test("fractional transfer arithmetic remains exact in integer cents", async () => {
    const original = transferRecords();
    original.accounts[0].balanceSnapshot = new Decimal("0.30");
    original.accounts[1].balanceSnapshot = new Decimal("0.20");
    const db = setup(original);
    assert.equal((await request("POST", { ...transfer, amount: 0.10 })).status, 201);
    assertBalances(db, { bank: "0.2", destination: "0.3" });
    assert.equal(db.records.positionHistory[0].bank.toString(), "0.5");
});

test("null/omitted notes clear on transfer replacement while provided notes are trimmed", async () => {
    for (const note of [undefined, null, " Note "]) {
        const original = transferRecords(true);
        original.transactions[0].note = "Old note";
        const db = setup(original);
        const result = await request("PUT", { ...transfer, note });
        assert.equal(result.status, 200);
        assert.equal(result.body.transaction.note, note ? "Note" : undefined);
        assert.equal(db.records.transactions[0].note, note ? "Note" : null);
    }
});

test("transfer failures roll back staged mutations with no committed history and no retries", async () => {
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
                const original = transferRecords(true);
                const db = setup(original, { failAt });
                const result = await request(method, { ...transfer, amount: 25 });
                assert.equal(result.status, 500);
                assert.equal(result.body.error, "INTERNAL_SERVER_ERROR");
                assert.equal(JSON.stringify(result.body).includes("PRIVATE_DATABASE_DIAGNOSTIC"), false);
                assertUnchanged(db, original, failAt !== "financialPositionSnapshot.create");
                assert.equal(db.options.length, 1);
                assert.deepEqual(db.options[0], { isolationLevel: "Serializable" });
            }
        }
        assert.equal(errors.length, attempts);
    } finally {
        console.error = previousError;
    }
});
