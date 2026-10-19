import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { Decimal } from "@prisma/client/runtime/client";
import {
    bank, database, entry, firstRecordedAt, holding, records, snapshotAt, userId,
} from "./helpers/finance-transaction-database.mjs";

const stateKey = "lifeos.investment-transaction-tests.dependencies";
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
const types = ["investment_purchase", "investment_sale"];

function input(type = "investment_purchase", overrides = {}) {
    return {
        type, amount: 50.25, description: "Recorded trade", date: "2026-10-01",
        accountId: "bank", investmentId: "holding", ...overrides,
    };
}

function tradeRecords(type) {
    const data = records();
    data.investments = [holding()];
    data.liabilities = [{
        id: "loan", userId, name: "Loan", type: "Loan", balance: new Decimal("20"),
        monthlyPayment: null, createdAt: snapshotAt, updatedAt: snapshotAt,
    }];
    if (type) data.transactions = [entry("owned", { type, investmentId: "holding" })];
    return data;
}

function setup(initial = tradeRecords(), settings) {
    dependencies.database = database(initial, settings);
    dependencies.getSession = async () => ({ user: { id: userId } });
    return dependencies.database;
}

async function request(method, body = input(), id = "owned", raw = false) {
    const req = new Request(`http://localhost/api/finance/transactions/${id}?userId=foreign`, {
        method,
        headers: { "Content-Type": "application/json", Cookie: "test-session" },
        ...(method !== "DELETE" ? { body: raw ? body : JSON.stringify(body) } : {}),
    });
    const response = method === "POST" ? await collectionRoute.POST(req)
        : await itemRoute[method](req, { params: Promise.resolve({ id }) });
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    return { status: response.status, body: await response.json() };
}

function assertValues(db, accounts, investments) {
    const balances = createLedgerBalances(db.records);
    for (const transaction of db.records.transactions) applyLedgerTransaction(balances, transaction);
    for (const [id, value] of Object.entries(accounts)) {
        assert.equal(decimalFromMinorUnits(balances.accounts.get(id).value).toString(), value, id);
    }
    for (const [id, value] of Object.entries(investments)) {
        assert.equal(decimalFromMinorUnits(balances.investments.get(id).value).toString(), value, id);
    }
}

function assertUnchanged(db, original, noSnapshotAttempt = true) {
    assert.deepEqual(db.records, original);
    if (noSnapshotAttempt) {
        assert.equal(db.calls.some((call) => call.method === "financialPositionSnapshot.create"), false);
    }
}

test("purchase and sale mutations require a session before parsing or reading Finance", async () => {
    const db = setup();
    dependencies.getSession = async ({ headers }) => {
        assert.equal(headers.get("Cookie"), "test-session");
        return null;
    };
    for (const type of types) {
        for (const method of ["POST", "PUT", "DELETE"]) {
            const result = await request(method, input(type));
            assert.equal(result.status, 401);
            assert.equal(result.body.error, "UNAUTHORIZED");
        }
    }
    assert.equal(db.options.length, 0);
});

test("trade creates store one session-owned row with server metadata and exact opposite asset effects", async () => {
    for (const type of types) {
        const original = tradeRecords();
        const db = setup(original);
        const result = await request("POST", input(type));
        assert.deepEqual(result, {
            status: 201,
            body: { transaction: { ...input(type), id: "generated-1", recordedAt: "2022-01-01T00:00:00.000Z" } },
        });
        assert.equal(db.records.transactions.length, 1);
        const row = db.records.transactions[0];
        assert.equal(row.userId, userId);
        assert.equal(row.investmentId, "holding");
        assert.equal(row.destinationAccountId, null);
        assert.equal(row.category, null);
        assert.equal(row.date.toISOString(), "2026-10-01T00:00:00.000Z");
        assert.equal(row.amount.toString(), "50.25");
        assertValues(db,
            { bank: type === "investment_purchase" ? "49.75" : "150.25" },
            { holding: type === "investment_purchase" ? "150.25" : "49.75" });
        assert.deepEqual(db.records.accounts, original.accounts);
        assert.deepEqual(db.records.investments, original.investments);
        assert.deepEqual(db.options, [{ isolationLevel: "Serializable" }]);
        assert.equal(db.calls.filter((call) => call.method === "financeTransaction.create").length, 1);
        const position = db.records.positionHistory[0];
        assert.equal(position.bank.plus(position.investments).minus(position.debt).toString(), "180");
        assert.equal(db.records.positionHistory.length, 1);
    }
});

test("trade requests keep strict amount/date/reference/metadata and incompatible-field validation", async () => {
    for (const type of types) {
        const valid = input(type);
        const invalid = [
            {}, { ...valid, accountId: undefined }, { ...valid, investmentId: undefined },
            { ...valid, accountId: " " }, { ...valid, investmentId: " " }, { ...valid, investmentId: "x".repeat(192) },
            { ...valid, amount: 0 }, { ...valid, amount: -1 }, { ...valid, amount: 0.001 },
            { ...valid, amount: "10" }, { ...valid, amount: 1e16 },
            { ...valid, date: "2026-02-30" }, { ...valid, date: "2026-10-01T00:00:00Z" },
            { ...valid, description: undefined }, { ...valid, description: " " },
            { ...valid, note: "x".repeat(251) }, { ...valid, type: "dividend" },
            ...["id", "userId", "recordedAt", "createdAt", "updatedAt", "category", "destinationAccountId", "unknown"]
                .map((field) => ({ ...valid, [field]: "forged" })),
            { ...valid, category: null }, { ...valid, destinationAccountId: null },
        ];
        for (const method of ["POST", "PUT"]) {
            for (const body of invalid) {
                const db = setup();
                const result = await request(method, body);
                assert.equal(result.status, 400, JSON.stringify(body));
                assert.equal(result.body.error, "INVALID_INPUT");
                assert.equal(db.options.length, 0);
            }
        }
    }
});

test("bank and investment ownership are validated independently for create and replacement", async () => {
    for (const type of types) {
        for (const method of ["POST", "PUT"]) {
            for (const field of ["accountId", "investmentId"]) {
                for (const id of ["missing", "foreign"]) {
                    const original = tradeRecords(type);
                    original.accounts.push(bank("foreign", { userId: "foreign" }));
                    original.investments.push(holding("foreign", { userId: "foreign" }));
                    const db = setup(original);
                    const result = await request(method, input(type, { [field]: id }));
                    assert.equal(result.status, 400);
                    assert.equal(result.body.error, field === "accountId" ? "INVALID_ACCOUNT" : "INVALID_INVESTMENT");
                    assertUnchanged(db, original);
                }
            }
        }
    }
});

test("old account/investment relationships are checked even when replacement references are valid", async () => {
    for (const type of types) {
        for (const method of ["PUT", "DELETE"]) {
            for (const field of ["accountId", "investmentId"]) {
                for (const id of ["missing", "foreign"]) {
                    const original = tradeRecords(type);
                    original.accounts.push(bank("foreign", { userId: "foreign" }));
                    original.investments.push(holding("foreign", { userId: "foreign" }));
                    original.transactions[0][field] = id;
                    const db = setup(original);
                    const result = await request(method, input(type));
                    assert.equal(result.status, 400);
                    assert.equal(result.body.error, field === "accountId" ? "INVALID_ACCOUNT" : "INVALID_INVESTMENT");
                    assertUnchanged(db, original);
                }
            }
            const original = tradeRecords(type);
            original.transactions[0].investmentId = null;
            const db = setup(original);
            const result = await request(method, input(type));
            assert.equal(result.status, 400);
            assert.equal(result.body.error, "INVALID_INVESTMENT");
            assertUnchanged(db, original);
        }
    }
});

test("foreign and missing trade transactions return identical 404s before entity lookups", async () => {
    for (const type of types) {
        for (const method of ["PUT", "DELETE"]) {
            for (const id of ["missing", "foreign"]) {
                const original = tradeRecords();
                original.transactions = [entry("foreign", { userId: "foreign", type, investmentId: "holding" })];
                const db = setup(original);
                assert.deepEqual(await request(method, input(type), id), {
                    status: 404, body: { error: "NOT_FOUND", message: "Transaction not found." },
                });
                assert.equal(db.calls.some((call) => call.method === "bankAccount.findFirst" || call.method === "investment.findFirst"), false);
                assertUnchanged(db, original);
            }
        }
    }
});

test("purchases cannot overdraw banks and sales cannot oversell tracked investments", async () => {
    for (const type of types) {
        for (const method of ["POST", "PUT"]) {
            const original = tradeRecords(method === "PUT" ? type : undefined);
            const db = setup(original);
            const result = await request(method, input(type, { amount: 100.01 }));
            assert.equal(result.status, 409);
            assert.equal(result.body.error, "NEGATIVE_BALANCE");
            assertUnchanged(db, original);
        }
    }
});

test("sale availability includes earlier purchases and sales rather than only the valuation snapshot", async () => {
    for (const priorType of types) {
        const original = tradeRecords();
        original.transactions = [entry("prior", {
            type: priorType, amount: new Decimal(priorType === "investment_purchase" ? "25" : "80"), investmentId: "holding",
        })];
        const db = setup(original);
        const result = await request("POST", input("investment_sale", {
            amount: priorType === "investment_purchase" ? 110 : 25,
        }));
        if (priorType === "investment_purchase") {
            assert.equal(result.status, 201);
            assertValues(db, { bank: "185" }, { holding: "15" });
        } else {
            assert.equal(result.status, 409);
            assert.equal(result.body.error, "NEGATIVE_BALANCE");
            assertUnchanged(db, original);
        }
    }
});

test("amount/date/description edits retain the original trade ID, ownership and recordedAt", async () => {
    for (const type of types) {
        const original = tradeRecords(type);
        const db = setup(original);
        const body = input(type, { amount: 25.10, description: " Revised trade ", date: "2010-03-02", note: " Note " });
        const result = await request("PUT", body);
        assert.deepEqual(result, {
            status: 200,
            body: { transaction: {
                ...body, description: "Revised trade", note: "Note", id: "owned", recordedAt: firstRecordedAt.toISOString(),
            } },
        });
        assert.equal(db.records.transactions[0].userId, userId);
        assertValues(db,
            { bank: type === "investment_purchase" ? "74.9" : "125.1" },
            { holding: type === "investment_purchase" ? "125.1" : "74.9" });
        assert.deepEqual(db.records.accounts, original.accounts);
        assert.deepEqual(db.records.investments, original.investments);
    }
});

test("account and investment replacements validate old/new references and recalculate both assets", async () => {
    for (const type of types) {
        const original = tradeRecords(type);
        original.accounts.push(bank("other-bank"));
        original.investments.push(holding("other-holding"));
        const db = setup(original);
        const result = await request("PUT", input(type, { amount: 25, accountId: "other-bank", investmentId: "other-holding" }));
        assert.equal(result.status, 200);
        assertValues(db,
            { bank: "100", "other-bank": type === "investment_purchase" ? "75" : "125" },
            { holding: "100", "other-holding": type === "investment_purchase" ? "125" : "75" });
        assert.deepEqual(db.calls.filter((call) => call.method === "bankAccount.findFirst").map((call) => call.query.where.id), ["bank", "other-bank"]);
        assert.deepEqual(db.calls.filter((call) => call.method === "investment.findFirst").map((call) => call.query.where.id), ["holding", "other-holding"]);
        assert.equal(db.records.transactions.length, 1);
    }
});

test("replacement banks and holdings must have sufficient resulting tracked balances", async () => {
    for (const type of types) {
        const original = tradeRecords(type);
        original.accounts.push(bank("empty-bank", { balanceSnapshot: new Decimal("0") }));
        original.investments.push(holding("empty-holding", { valuationSnapshot: new Decimal("0") }));
        const db = setup(original);
        const result = await request("PUT", input(type, type === "investment_purchase"
            ? { accountId: "empty-bank" } : { investmentId: "empty-holding" }));
        assert.equal(result.status, 409);
        assert.equal(result.body.error, "NEGATIVE_BALANCE");
        assertUnchanged(db, original);
    }
});

test("deleting trades reverses their bank/investment effects without deleting related records", async () => {
    for (const type of types) {
        const original = tradeRecords(type);
        const db = setup(original);
        assert.deepEqual(await request("DELETE"), { status: 200, body: { success: true } });
        assertValues(db, { bank: "100" }, { holding: "100" });
        assert.deepEqual(db.records.accounts, original.accounts);
        assert.deepEqual(db.records.investments, original.investments);
        assert.equal(db.records.transactions.length, 0);
        assert.equal(db.records.positionHistory[0].bank.toString(), "100");
        assert.equal(db.records.positionHistory[0].investments.toString(), "100");
    }
});

test("deleting, reducing or moving a purchase cannot remove value used by a subsequent sale", async () => {
    for (const [method, overrides] of [
        ["DELETE", {}], ["PUT", { amount: 10 }], ["PUT", { investmentId: "other-holding" }],
    ]) {
        const original = tradeRecords("investment_purchase");
        original.investments[0].valuationSnapshot = new Decimal("0");
        original.investments.push(holding("other-holding"));
        original.transactions.push(entry("later-sale", {
            type: "investment_sale", amount: new Decimal("40"), investmentId: "holding", recordedAt: new Date("2021-02-01T00:00:00Z"),
        }));
        const db = setup(original);
        const result = await request(method, input("investment_purchase", overrides));
        assert.equal(result.status, 409);
        assert.equal(result.body.error, "NEGATIVE_BALANCE");
        assertUnchanged(db, original);
    }
});

test("deleting, reducing or moving a sale cannot remove bank funds used by subsequent expenses", async () => {
    for (const [method, overrides] of [
        ["DELETE", {}], ["PUT", { amount: 10 }], ["PUT", { accountId: "other-bank" }],
    ]) {
        const original = tradeRecords("investment_sale");
        original.accounts[0].balanceSnapshot = new Decimal("0");
        original.accounts.push(bank("other-bank"));
        original.transactions.push(entry("spent", {
            type: "expense", category: "Food", amount: new Decimal("40"), recordedAt: new Date("2021-02-01T00:00:00Z"),
        }));
        const db = setup(original);
        const result = await request(method, input("investment_sale", overrides));
        assert.equal(result.status, 409);
        assert.equal(result.body.error, "NEGATIVE_BALANCE");
        assertUnchanged(db, original);
    }
});

test("every cross-type trade conversion remains rejected in either direction", async () => {
    const allTypes = ["income", "expense", "transfer", ...types];
    for (const originalType of allTypes) {
        for (const replacementType of allTypes) {
            if (originalType === replacementType || (!types.includes(originalType) && !types.includes(replacementType))) continue;
            const original = tradeRecords();
            original.accounts.push(bank("destination"));
            original.transactions = [entry("owned", {
                type: originalType,
                investmentId: types.includes(originalType) ? "holding" : null,
                destinationAccountId: originalType === "transfer" ? "destination" : null,
                category: originalType === "expense" ? "Food" : null,
            })];
            const body = types.includes(replacementType) ? input(replacementType) : {
                type: replacementType, amount: 10, description: "Changed type", date: "2026-10-01", accountId: "bank",
                ...(replacementType === "expense" ? { category: "Food" } : {}),
                ...(replacementType === "transfer" ? { destinationAccountId: "destination" } : {}),
            };
            const db = setup(original);
            const result = await request("PUT", body);
            assert.equal(result.status, 400);
            assert.equal(result.body.error, "TRANSACTION_TYPE_CHANGE_NOT_SUPPORTED");
            assertUnchanged(db, original);
        }
    }
});

test("trades leave ordinary cash flow, savings rate and category spending unchanged", async () => {
    for (const type of types) {
        const original = tradeRecords();
        original.transactions = [
            entry("income", { amount: new Decimal("10") }),
            entry("expense", { type: "expense", amount: new Decimal("5"), category: "Food", recordedAt: new Date("2021-02-01T00:00:00Z") }),
        ];
        const db = setup(original);
        const before = toFinanceDataResponse(original);
        assert.equal((await request("POST", input(type))).status, 201);
        const after = toFinanceDataResponse(db.records);
        assert.deepEqual(monthlyActivity(after.transactions, "2026-10"), { income: 10, expenses: 5, netCashFlow: 5, savingsRate: 50 });
        assert.deepEqual(monthlyActivity(after.transactions, "2026-10"), monthlyActivity(before.transactions, "2026-10"));
        assert.deepEqual(categorySpending(after.transactions, "2026-10"), categorySpending(before.transactions, "2026-10"));
    }
});

test("bank and valuation timestamps independently control trade effects, excluding equality", async () => {
    for (const type of types) {
        for (const excluded of ["bank", "holding"]) {
            const original = tradeRecords();
            if (excluded === "bank") original.accounts[0].balanceSnapshotAt = firstRecordedAt;
            else original.investments[0].valuationSnapshotAt = firstRecordedAt;
            const db = setup(original, { recordedAt: firstRecordedAt });
            assert.equal((await request("POST", input(type))).status, 201);
            assertValues(db,
                { bank: excluded === "bank" ? "100" : type === "investment_purchase" ? "49.75" : "150.25" },
                { holding: excluded === "holding" ? "100" : type === "investment_purchase" ? "150.25" : "49.75" });
            assert.deepEqual(db.records.accounts, original.accounts);
            assert.deepEqual(db.records.investments, original.investments);
        }
    }
});

test("historical trade edits/deletes do not replay effects absorbed by replacement snapshots", async () => {
    for (const type of types) {
        for (const method of ["PUT", "DELETE"]) {
            for (const cutoff of [firstRecordedAt, new Date(firstRecordedAt.getTime() + 1)]) {
                const original = tradeRecords(type);
                original.accounts[0].balanceSnapshotAt = cutoff;
                original.investments[0].valuationSnapshotAt = cutoff;
                const db = setup(original);
                const result = await request(method, input(type, { amount: 10000, date: "2099-01-01" }));
                assert.equal(result.status, 200);
                assertValues(db, { bank: "100" }, { holding: "100" });
                if (method === "PUT") assert.equal(result.body.transaction.recordedAt, firstRecordedAt.toISOString());
            }
        }
    }
});

test("order-sensitive purchase/sale timestamp ties retain the existing conflict behavior", async () => {
    for (const type of types) {
        const original = tradeRecords();
        if (type === "investment_purchase") original.accounts[0].balanceSnapshot = new Decimal("0");
        else original.investments[0].valuationSnapshot = new Decimal("0");
        original.transactions = [entry("funding-trade", {
            type: type === "investment_purchase" ? "investment_sale" : "investment_purchase",
            investmentId: "holding", amount: new Decimal("100"),
        })];
        const db = setup(original, { recordedAt: firstRecordedAt });
        const result = await request("POST", input(type));
        assert.equal(result.status, 409);
        assert.equal(result.body.error, "AMBIGUOUS_LEDGER_ORDER");
        assertUnchanged(db, original);
    }
});

test("fractional trade effects remain exact and conserve financial assets when both cutoffs apply", async () => {
    for (const type of types) {
        const original = tradeRecords();
        original.accounts[0].balanceSnapshot = new Decimal("0.30");
        original.investments[0].valuationSnapshot = new Decimal("0.20");
        const db = setup(original);
        assert.equal((await request("POST", input(type, { amount: 0.10 }))).status, 201);
        assertValues(db,
            { bank: type === "investment_purchase" ? "0.2" : "0.4" },
            { holding: type === "investment_purchase" ? "0.3" : "0.1" });
        const position = db.records.positionHistory[0];
        assert.equal(position.bank.plus(position.investments).toString(), "0.5");
    }
});

test("permitted trade notes preserve trimming, empty text and null/omission clearing", async () => {
    for (const type of types) {
        for (const note of [undefined, null, " Note ", ""]) {
            const original = tradeRecords(type);
            original.transactions[0].note = "Old note";
            const db = setup(original);
            const result = await request("PUT", input(type, { note }));
            assert.equal(result.status, 200);
            assert.equal(result.body.transaction.note, note == null ? undefined : note.trim());
            assert.equal(db.records.transactions[0].note, note == null ? null : note.trim());
        }
    }
});

test("trade mutation, entity-read, ledger-read and history-write failures roll back staged records", async () => {
    const previousError = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args);
    let attempts = 0;
    try {
        for (const type of types) {
            for (const method of ["POST", "PUT", "DELETE"]) {
                const operation = method === "POST" ? "financeTransaction.create"
                    : method === "PUT" ? "financeTransaction.updateMany" : "financeTransaction.deleteMany";
                for (const failAt of [operation, "investment.findFirst", "financeTransaction.findMany", "financialPositionSnapshot.create"]) {
                    attempts++;
                    const original = tradeRecords(type);
                    const db = setup(original, { failAt });
                    const result = await request(method, input(type, { amount: 25 }));
                    assert.equal(result.status, 500);
                    assert.equal(result.body.error, "INTERNAL_SERVER_ERROR");
                    assert.equal(JSON.stringify(result.body).includes("PRIVATE_DATABASE_DIAGNOSTIC"), false);
                    assertUnchanged(db, original, failAt !== "financialPositionSnapshot.create");
                    assert.deepEqual(db.options, [{ isolationLevel: "Serializable" }]);
                }
            }
        }
        assert.equal(errors.length, attempts);
    } finally {
        console.error = previousError;
    }
});
