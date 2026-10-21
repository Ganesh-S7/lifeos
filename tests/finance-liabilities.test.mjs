import "./helpers/register-typescript.mjs";
import { sameOriginHeaders } from "./helpers/mutation-request.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { Decimal } from "@prisma/client/runtime/client";

const stateKey = "lifeos.liability-tests.dependencies";
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
        if (specifier === "@/features/finance/server/liability-handler") {
            return nextResolve(new URL("../src/features/finance/server/liability-handler.ts", import.meta.url).href, context);
        }
        if (specifier === "next/server") return nextResolve("next/server.js", context);
        return nextResolve(specifier, context);
    },
});

const collectionRoute = await import("../src/app/api/finance/liabilities/route.ts");
const itemRoute = await import("../src/app/api/finance/liabilities/[id]/route.ts");
const { calculateFinancialPosition } = await import("../src/features/finance/server/finance-position.ts");
const { toFinanceDataResponse } = await import("../src/features/finance/server/finance-dto.ts");
const { financialSnapshot } = await import("../src/features/finance/utils/finance-calculations.ts");
const userId = "user-a";
const timestamp = new Date("2026-10-01T00:00:00.000Z");
const later = new Date("2026-10-02T00:00:00.000Z");
const validInput = { name: "Bike loan", type: "Loan", balance: 200.25, monthlyPayment: 10.50 };

function liability(id = "owned", owner = userId) {
    return {
        id, userId: owner, name: "Loan", type: "Loan", balance: new Decimal("100"),
        monthlyPayment: new Decimal("20"), createdAt: timestamp, updatedAt: timestamp,
    };
}

function emptyRecords() {
    return { accounts: [], investments: [], liabilities: [], transactions: [], positionHistory: [] };
}

// Isolated transaction double: stage changes, publish only when the callback resolves.
// This verifies service orchestration, not MySQL's actual rollback/locking implementation.
function database(initial = emptyRecords(), failAt) {
    let records = initial;
    const calls = [];
    const options = [];
    let serial = 0;
    return {
        calls,
        options,
        get records() {
            return records;
        },
        client: {
            async $transaction(callback, settings) {
                options.push(settings);
                const staged = Object.fromEntries(Object.entries(records).map(([key, rows]) =>
                    [key, rows.map((row) => ({ ...row }))]));
                const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
                const log = (method, query) => {
                    calls.push({ method, query });
                    if (failAt === method) throw new Error("PRIVATE_DATABASE_DIAGNOSTIC");
                };
                const transaction = {};
                for (const [model, collection] of [
                    ["bankAccount", "accounts"], ["investment", "investments"],
                    ["liability", "liabilities"], ["financeTransaction", "transactions"],
                ]) {
                    transaction[model] = {
                        async findMany(query) {
                            log(`${model}.findMany`, query);
                            assert.deepEqual(query.where, { userId });
                            return staged[collection].filter((row) => matches(row, query.where));
                        },
                    };
                }
                Object.assign(transaction.liability, {
                    async create(query) {
                        log("liability.create", query);
                        assert.equal(query.data.userId, userId);
                        const row = {
                            ...query.data, id: `generated-${++serial}`,
                            balance: new Decimal(query.data.balance),
                            monthlyPayment: query.data.monthlyPayment === null ? null : new Decimal(query.data.monthlyPayment),
                            createdAt: later, updatedAt: later,
                        };
                        staged.liabilities.push(row);
                        return row;
                    },
                    async updateMany(query) {
                        log("liability.updateMany", query);
                        assert.equal(query.where.userId, userId);
                        let count = 0;
                        staged.liabilities = staged.liabilities.map((row) => {
                            if (!matches(row, query.where)) return row;
                            count++;
                            return {
                                ...row, ...query.data, balance: new Decimal(query.data.balance),
                                monthlyPayment: query.data.monthlyPayment === null ? null : new Decimal(query.data.monthlyPayment),
                                updatedAt: later,
                            };
                        });
                        return { count };
                    },
                    async findFirst(query) {
                        log("liability.findFirst", query);
                        assert.equal(query.where.userId, userId);
                        return staged.liabilities.find((row) => matches(row, query.where)) ?? null;
                    },
                    async deleteMany(query) {
                        log("liability.deleteMany", query);
                        assert.equal(query.where.userId, userId);
                        const count = staged.liabilities.filter((row) => matches(row, query.where)).length;
                        staged.liabilities = staged.liabilities.filter((row) => !matches(row, query.where));
                        return { count };
                    },
                });
                transaction.financialPositionSnapshot = {
                    async create(query) {
                        log("financialPositionSnapshot.create", query);
                        const row = { ...query.data, id: `snapshot-${++serial}`, recordedAt: later };
                        staged.positionHistory.push(row);
                        return row;
                    },
                };
                const result = await callback(transaction);
                records = staged;
                return result;
            },
        },
    };
}

function setup(records = emptyRecords(), failAt) {
    dependencies.database = database(records, failAt);
    dependencies.getSession = async () => ({ user: { id: userId } });
    return dependencies.database;
}

async function request(method, input = validInput, id = "owned", raw = false) {
    const req = new Request(`http://localhost/api/finance/liabilities/${id}?userId=foreign`, {
        method,
        headers: sameOriginHeaders({ "Content-Type": "application/json", Cookie: "test-session" }),
        ...(method !== "DELETE" ? { body: raw ? input : JSON.stringify(input) } : {}),
    });
    const response = method === "POST" ? await collectionRoute.POST(req)
        : await itemRoute[method](req, { params: Promise.resolve({ id }) });
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    return { status: response.status, body: await response.json() };
}

test("routes expose only requested mutations with dynamic Node configuration", () => {
    assert.deepEqual(Object.keys(collectionRoute).sort(), ["POST", "dynamic", "runtime"]);
    assert.deepEqual(Object.keys(itemRoute).sort(), ["DELETE", "PUT", "dynamic", "runtime"]);
    for (const route of [collectionRoute, itemRoute]) {
        assert.equal(route.runtime, "nodejs");
        assert.equal(route.dynamic, "force-dynamic");
    }
});

test("all methods require a session before parsing or accessing the database", async () => {
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

test("create uses session ownership, Decimal DTOs and atomically writes updated debt", async () => {
    const records = emptyRecords();
    records.liabilities = [liability("foreign", "foreign")];
    const db = setup(records);
    const result = await request("POST", { ...validInput, name: " Bike loan " });
    assert.equal(result.status, 201);
    assert.deepEqual(result.body.liability, {
        id: "generated-1", name: "Bike loan", type: "Loan", balance: 200.25, monthlyPayment: 10.5,
        createdAt: later.toISOString(), updatedAt: later.toISOString(),
    });
    assert.deepEqual(db.options, [{ isolationLevel: "Serializable" }]);
    assert.equal(db.records.positionHistory.length, 1);
    assert.equal(db.records.positionHistory[0].userId, userId);
    assert.equal(db.records.positionHistory[0].debt.toString(), "200.25");
    assert.equal(db.records.positionHistory[0].bank.toString(), "0");
    const create = db.calls.find((call) => call.method === "liability.create");
    assert.deepEqual(Object.keys(create.query.data).sort(), ["balance", "monthlyPayment", "name", "type", "userId"]);
});

test("PUT replaces editable fields, preserves identity and captures all current debt", async () => {
    const records = emptyRecords();
    records.liabilities = [liability(), liability("other"), liability("foreign", "foreign")];
    const db = setup(records);
    const result = await request("PUT", { ...validInput, balance: 50.25 });
    assert.equal(result.status, 200);
    assert.equal(result.body.liability.id, "owned");
    assert.equal(result.body.liability.createdAt, timestamp.toISOString());
    assert.equal(result.body.liability.updatedAt, later.toISOString());
    assert.equal(result.body.liability.balance, 50.25);
    assert.equal(db.records.positionHistory[0].debt.toString(), "150.25");
    assert.equal(db.records.liabilities.find((row) => row.id === "foreign").balance.toString(), "100");
});

test("omitted/null monthlyPayment clears it on PUT and is omitted from create/PUT JSON", async () => {
    for (const monthlyPayment of [undefined, null, 0]) {
        for (const method of ["POST", "PUT"]) {
            const records = emptyRecords();
            records.liabilities = [liability()];
            const db = setup(records);
            const result = await request(method, { ...validInput, monthlyPayment });
            assert.equal(result.status, method === "POST" ? 201 : 200);
            assert.equal(result.body.liability.monthlyPayment, monthlyPayment === 0 ? 0 : undefined);
            const row = db.records.liabilities.find((entry) => entry.id === result.body.liability.id);
            assert.equal(row.monthlyPayment?.toNumber() ?? null, monthlyPayment === 0 ? 0 : null);
        }
    }
});

test("delete returns consistent success and captures remaining debt", async () => {
    const records = emptyRecords();
    records.liabilities = [liability(), liability("remaining")];
    const db = setup(records);
    const result = await request("DELETE");
    assert.deepEqual(result, { status: 200, body: { success: true } });
    assert.deepEqual(db.records.liabilities.map((row) => row.id), ["remaining"]);
    assert.equal(db.records.positionHistory[0].debt.toString(), "100");
});

test("foreign and missing records produce identical 404s and no snapshots", async () => {
    for (const method of ["PUT", "DELETE"]) {
        for (const id of ["foreign", "missing"]) {
            const records = emptyRecords();
            records.liabilities = [liability("foreign", "foreign")];
            const db = setup(records);
            const result = await request(method, validInput, id);
            assert.deepEqual(result, { status: 404, body: { error: "NOT_FOUND", message: "Liability not found." } });
            assert.equal(db.records.liabilities.length, 1);
            assert.equal(db.records.positionHistory.length, 0);
            assert.equal(db.calls.some((call) => call.method === "financialPositionSnapshot.create"), false);
        }
    }
});

test("strict create/PUT contracts reject invalid money, missing and server-controlled fields", async () => {
    const invalid = [
        {}, null, [], { ...validInput, name: " " }, { ...validInput, type: "" },
        { ...validInput, balance: -1 }, { ...validInput, monthlyPayment: -1 },
        { ...validInput, balance: 0.001 }, { ...validInput, monthlyPayment: 0.001 },
        { ...validInput, balance: "100" }, { ...validInput, balance: 1e16 },
        ...["id", "userId", "createdAt", "updatedAt", "unexpected"].map((field) => ({ ...validInput, [field]: "forged" })),
    ];
    for (const method of ["POST", "PUT"]) {
        for (const input of invalid) {
            const db = setup();
            const result = await request(method, input);
            assert.equal(result.status, 400, JSON.stringify(input));
            assert.equal(result.body.error, "INVALID_INPUT");
            assert.equal(db.options.length, 0);
        }
        setup();
        assert.equal((await request(method, "{broken", "owned", true)).status, 400);
    }
});

test("invalid record IDs fail before mutation", async () => {
    for (const method of ["PUT", "DELETE"]) {
        for (const id of ["", " ", "a".repeat(192)]) {
            const db = setup();
            assert.equal((await request(method, validInput, id)).status, 400);
            assert.equal(db.options.length, 0);
        }
    }
});

test("zero balance and a final deletion produce real zero-position mutation snapshots", async () => {
    const db = setup();
    const created = await request("POST", { ...validInput, balance: 0 });
    assert.equal(created.status, 201);
    assert.equal(db.records.positionHistory[0].debt.toString(), "0");
    assert.equal((await request("DELETE", undefined, created.body.liability.id)).status, 200);
    assert.equal(db.records.positionHistory.length, 2);
    assert.equal(db.records.liabilities.length, 0);
});

test("mutation, aggregate-read and snapshot failures return generic 500 and leave staged records uncommitted", async () => {
    const previousError = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args);
    try {
        for (const method of ["POST", "PUT", "DELETE"]) {
            for (const failAt of [
                method === "POST" ? "liability.create" : method === "PUT" ? "liability.updateMany" : "liability.deleteMany",
                "bankAccount.findMany", "financialPositionSnapshot.create",
            ]) {
                const records = emptyRecords();
                records.liabilities = [liability()];
                const db = setup(records, failAt);
                const result = await request(method);
                assert.equal(result.status, 500);
                assert.equal(result.body.error, "INTERNAL_SERVER_ERROR");
                assert.equal(JSON.stringify(result.body).includes("PRIVATE_DATABASE_DIAGNOSTIC"), false);
                assert.equal(db.records.liabilities.length, 1);
                assert.equal(db.records.liabilities[0].balance.toString(), "100");
                assert.equal(db.records.positionHistory.length, 0);
                if (failAt.startsWith("liability.")) {
                    assert.equal(db.calls.some((call) => call.method === "financialPositionSnapshot.create"), false);
                }
            }
        }
        assert.equal(errors.length, 9);
    } finally {
        console.error = previousError;
    }
});

test("auth failures are generic and do not reach mutation services", async () => {
    const db = setup();
    dependencies.getSession = async () => { throw new Error("PRIVATE_AUTH_DIAGNOSTIC"); };
    const previousError = console.error;
    console.error = () => {};
    try {
        for (const method of ["POST", "PUT", "DELETE"]) {
            const result = await request(method);
            assert.equal(result.status, 500);
            assert.equal(JSON.stringify(result.body).includes("PRIVATE_AUTH_DIAGNOSTIC"), false);
        }
        assert.equal(db.options.length, 0);
    } finally {
        console.error = previousError;
    }
});

function ledgerRecords() {
    const records = emptyRecords();
    const base = { userId, name: "Owned", createdAt: timestamp, updatedAt: timestamp };
    records.accounts = [
        { ...base, id: "a", balanceSnapshot: new Decimal("100"), balanceSnapshotAt: timestamp },
        { ...base, id: "b", balanceSnapshot: new Decimal("50"), balanceSnapshotAt: later },
    ];
    records.investments = [{
        ...base, id: "investment", type: "Cryptocurrency", valuationSnapshot: new Decimal("40"), valuationSnapshotAt: timestamp,
    }];
    records.liabilities = [liability()];
    const entry = {
        userId, accountId: "a", destinationAccountId: null, investmentId: null,
        description: "Recorded", date: new Date("2099-01-01T00:00:00.000Z"),
        recordedAt: later, category: null, note: null,
    };
    records.transactions = [
        { ...entry, id: "old", type: "expense", amount: new Decimal("500"), category: "Other", recordedAt: new Date(timestamp.getTime() - 1) },
        { ...entry, id: "tie", type: "income", amount: new Decimal("500"), recordedAt: timestamp },
        { ...entry, id: "income", type: "income", amount: new Decimal("20.10") },
        { ...entry, id: "expense", type: "expense", amount: new Decimal("0.20"), category: "Other" },
        // Applies to source a, but is already included in b's newer balance snapshot.
        { ...entry, id: "transfer", type: "transfer", amount: new Decimal("10"), destinationAccountId: "b" },
        { ...entry, id: "purchase", type: "investment_purchase", amount: new Decimal("5.10"), investmentId: "investment" },
        { ...entry, id: "sale", type: "investment_sale", amount: new Decimal("2.20"), investmentId: "investment" },
        { ...entry, id: "old-purchase", type: "investment_purchase", amount: new Decimal("500"), investmentId: "investment", recordedAt: timestamp },
    ];
    return records;
}

test("position calculations preserve independent strict recordedAt cutoffs and ledger effects", () => {
    const records = ledgerRecords();
    const actual = calculateFinancialPosition(records);
    assert.equal(actual.bank.toString(), "157");
    assert.equal(actual.investments.toString(), "42.9");
    assert.equal(actual.debt.toString(), "100");
    const frontend = financialSnapshot(toFinanceDataResponse(records));
    for (const field of ["bank", "investments", "debt"]) {
        assert.ok(Math.abs(actual[field].toNumber() - frontend[field]) < 1e-9);
    }
    assert.deepEqual(calculateFinancialPosition({ ...records, transactions: [...records.transactions].reverse() }), actual);
});

test("history writer uses full owned ledgers after the liability change without reusing prior totals", async () => {
    const records = ledgerRecords();
    records.positionHistory = [{ id: "old", userId, recordedAt: timestamp, bank: new Decimal("999"), investments: new Decimal("999"), debt: new Decimal("999") }];
    const db = setup(records);
    const result = await request("PUT", { ...validInput, balance: 200.25 });
    assert.equal(result.status, 200);
    const snapshot = db.records.positionHistory[1];
    assert.equal(snapshot.bank.toString(), "157");
    assert.equal(snapshot.investments.toString(), "42.9");
    assert.equal(snapshot.debt.toString(), "200.25");
    assert.equal(db.records.positionHistory[0].bank.toString(), "999");
});

test("transfers conserve combined bank value and trades conserve financial assets", () => {
    const records = ledgerRecords();
    records.accounts[1].balanceSnapshotAt = timestamp;
    const withTrades = calculateFinancialPosition(records);
    const withoutTransfers = calculateFinancialPosition({
        ...records,
        transactions: records.transactions.filter((row) => row.type !== "transfer"),
    });
    assert.equal(withTrades.bank.toString(), withoutTransfers.bank.toString());
    assert.equal(withTrades.bank.toString(), "167");
    const withoutTrades = calculateFinancialPosition({
        ...records,
        transactions: records.transactions.filter((row) => !row.type.startsWith("investment_")),
    });
    assert.equal(
        withTrades.bank.plus(withTrades.investments).toString(),
        withoutTrades.bank.plus(withoutTrades.investments).toString(),
    );
});

test("new balance and valuation snapshots exclude previous ledger entries independently", () => {
    const records = ledgerRecords();
    records.accounts[0].balanceSnapshotAt = later;
    let actual = calculateFinancialPosition(records);
    assert.equal(actual.bank.toString(), "150");
    assert.equal(actual.investments.toString(), "42.9");
    records.investments[0].valuationSnapshotAt = later;
    actual = calculateFinancialPosition(records);
    assert.equal(actual.bank.toString(), "150");
    assert.equal(actual.investments.toString(), "40");
});

test("money summation is exact across cents and rejects precision instead of rounding", () => {
    const records = emptyRecords();
    records.liabilities = [
        { ...liability("a"), balance: new Decimal("0.1") },
        { ...liability("b"), balance: new Decimal("0.2") },
    ];
    assert.equal(calculateFinancialPosition(records).debt.toString(), "0.3");
    records.liabilities[0].balance = new Decimal("0.001");
    assert.throws(() => calculateFinancialPosition(records), /at most two decimal places/);
});

test("DTO-range failures roll back a liability even when its individual amount is valid", async () => {
    const records = emptyRecords();
    records.liabilities = [{ ...liability(), balance: new Decimal("90071992547409.90") }];
    const db = setup(records);
    const previousError = console.error;
    console.error = () => {};
    try {
        const result = await request("POST", { ...validInput, balance: 1 });
        assert.equal(result.status, 500);
        assert.equal(db.records.liabilities.length, 1);
        assert.equal(db.records.positionHistory.length, 0);
    } finally {
        console.error = previousError;
    }
});
