import "./helpers/register-typescript.mjs";
import { sameOriginHeaders } from "./helpers/mutation-request.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { Decimal } from "@prisma/client/runtime/client";

const stateKey = "lifeos.investment-tests.dependencies";
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
        if (specifier === "@/features/finance/server/investment-handler") {
            return nextResolve(new URL("../src/features/finance/server/investment-handler.ts", import.meta.url).href, context);
        }
        if (specifier === "next/server") return nextResolve("next/server.js", context);
        return nextResolve(specifier, context);
    },
});

const collectionRoute = await import("../src/app/api/finance/investments/route.ts");
const itemRoute = await import("../src/app/api/finance/investments/[id]/route.ts");
const { mutateInvestment } = await import("../src/features/finance/server/investment-mutations.ts");
const { investmentValue, financialSnapshot } = await import("../src/features/finance/utils/finance-calculations.ts");
const { toFinanceDataResponse } = await import("../src/features/finance/server/finance-dto.ts");

const userId = "user-a";
const oldTime = new Date("2020-01-01T00:00:00.000Z");
const validInput = { name: "Holding", type: "Cryptocurrency", value: 25000.25 };

function investment(id = "owned", owner = userId) {
    return {
        id, userId: owner, name: "Original", type: "Cryptocurrency", valuationSnapshot: new Decimal("100"),
        valuationSnapshotAt: oldTime, createdAt: oldTime, updatedAt: oldTime,
    };
}

function transaction(overrides = {}) {
    return {
        id: "record", userId, type: "investment_purchase", amount: new Decimal("10"),
        description: "Recorded trade", date: new Date("2099-01-01T00:00:00.000Z"),
        recordedAt: new Date("2020-02-01T00:00:00.000Z"), accountId: "bank",
        destinationAccountId: null, investmentId: "owned", category: null, note: null,
        ...overrides,
    };
}

function emptyRecords() {
    return { accounts: [], investments: [], liabilities: [], transactions: [], positionHistory: [] };
}

// This stages changes in memory. It tests orchestration and requested isolation,
// not real MySQL locks, FK enforcement, transaction rollback, or concurrent clients.
function database(initial = emptyRecords(), settings = {}) {
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
            async $transaction(callback, configuration) {
                options.push(configuration);
                const staged = Object.fromEntries(Object.entries(records).map(([key, rows]) =>
                    [key, rows.map((row) => ({ ...row }))]));
                const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
                const log = (method, query) => {
                    calls.push({ method, query });
                    if (settings.failAt === method) {
                        throw Object.assign(new Error("PRIVATE_DATABASE_DIAGNOSTIC"), {
                            code: settings.errorCode,
                        });
                    }
                };
                const tx = {};
                for (const [model, collection] of [
                    ["bankAccount", "accounts"], ["investment", "investments"],
                    ["liability", "liabilities"], ["financeTransaction", "transactions"],
                ]) {
                    tx[model] = {
                        async findMany(query) {
                            log(`${model}.findMany`, query);
                            assert.deepEqual(query.where, { userId });
                            return staged[collection].filter((row) => matches(row, query.where));
                        },
                    };
                }
                Object.assign(tx.investment, {
                    async create(query) {
                        log("investment.create", query);
                        assert.equal(query.data.userId, userId);
                        const now = new Date();
                        const row = {
                            ...query.data, id: `generated-${++serial}`,
                            valuationSnapshot: new Decimal(query.data.valuationSnapshot),
                            createdAt: now, updatedAt: now,
                        };
                        staged.investments.push(row);
                        return row;
                    },
                    async updateMany(query) {
                        log("investment.updateMany", query);
                        assert.equal(query.where.userId, userId);
                        settings.onUpdate?.(staged, query.data);
                        let count = 0;
                        staged.investments = staged.investments.map((row) => {
                            if (!matches(row, query.where)) return row;
                            count++;
                            return {
                                ...row, ...query.data,
                                valuationSnapshot: new Decimal(query.data.valuationSnapshot),
                                updatedAt: new Date(),
                            };
                        });
                        return { count };
                    },
                    async findFirst(query) {
                        log("investment.findFirst", query);
                        assert.equal(query.where.userId, userId);
                        return staged.investments.find((row) => matches(row, query.where)) ?? null;
                    },
                    async deleteMany(query) {
                        log("investment.deleteMany", query);
                        assert.equal(query.where.userId, userId);
                        if (settings.insertReferenceBeforeDelete) {
                            staged.transactions.push(transaction({ investmentId: query.where.id }));
                        }
                        const matched = staged.investments.filter((row) => matches(row, query.where));
                        if (matched.some((row) => staged.transactions.some((entry) =>
                            entry.investmentId === row.id))) {
                            throw Object.assign(new Error("PRIVATE_FOREIGN_KEY_DIAGNOSTIC"), { code: "P2003" });
                        }
                        staged.investments = staged.investments.filter((row) => !matches(row, query.where));
                        return { count: matched.length };
                    },
                });
                tx.financeTransaction.findFirst = async (query) => {
                    log("financeTransaction.findFirst", query);
                    assert.deepEqual(query, {
                        where: { investmentId: "owned" },
                        select: { id: true },
                    });
                    const row = staged.transactions.find((entry) => matches(entry, query.where));
                    return row ? { id: row.id } : null;
                };
                tx.financialPositionSnapshot = {
                    async create(query) {
                        log("financialPositionSnapshot.create", query);
                        const row = { ...query.data, id: `snapshot-${++serial}`, recordedAt: new Date() };
                        staged.positionHistory.push(row);
                        return row;
                    },
                };
                const result = await callback(tx);
                records = staged;
                return result;
            },
        },
    };
}

function setup(records = emptyRecords(), settings) {
    dependencies.database = database(records, settings);
    dependencies.getSession = async () => ({ user: { id: userId } });
    return dependencies.database;
}

async function request(method, input = validInput, id = "owned", raw = false) {
    const req = new Request(`http://localhost/api/finance/investments/${id}?userId=foreign`, {
        method,
        headers: sameOriginHeaders({ "Content-Type": "application/json", Cookie: "test-session" }),
        ...(method !== "DELETE" ? { body: raw ? input : JSON.stringify(input) } : {}),
    });
    const response = method === "POST" ? await collectionRoute.POST(req)
        : await itemRoute[method](req, { params: Promise.resolve({ id }) });
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    return { status: response.status, body: await response.json() };
}

test("routes expose only investment mutations with dynamic Node configuration", () => {
    assert.deepEqual(Object.keys(collectionRoute).sort(), ["POST", "dynamic", "runtime"]);
    assert.deepEqual(Object.keys(itemRoute).sort(), ["DELETE", "PUT", "dynamic", "runtime"]);
    for (const route of [collectionRoute, itemRoute]) {
        assert.equal(route.runtime, "nodejs");
        assert.equal(route.dynamic, "force-dynamic");
    }
});

test("all methods authenticate before parsing or accessing the database", async () => {
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

test("create maps value and server snapshot time using only session ownership", async () => {
    const db = setup();
    const before = Date.now();
    const result = await request("POST", { ...validInput, name: " Holding ", type: " Cryptocurrency " });
    const after = Date.now();
    assert.equal(result.status, 201);
    const dto = result.body.investment;
    assert.equal(dto.id, "generated-1");
    assert.equal(dto.name, "Holding");
    assert.equal(dto.type, "Cryptocurrency");
    assert.equal(dto.valuationSnapshot, 25000.25);
    assert.equal(dto.userId, undefined);
    assert.ok(Date.parse(dto.valuationSnapshotAt) >= before && Date.parse(dto.valuationSnapshotAt) <= after);
    assert.equal(new Date(dto.createdAt).toISOString(), dto.createdAt);
    assert.equal(new Date(dto.updatedAt).toISOString(), dto.updatedAt);
    const create = db.calls.find((call) => call.method === "investment.create");
    assert.deepEqual(Object.keys(create.query.data).sort(), ["name", "type", "userId", "valuationSnapshot", "valuationSnapshotAt"]);
    assert.equal(create.query.data.valuationSnapshot, "25000.25");
    assert.equal(create.query.data.userId, userId);
    assert.deepEqual(db.options, [{ isolationLevel: "Serializable" }]);
    assert.equal(db.records.positionHistory.length, 1);
    assert.equal(db.records.positionHistory[0].investments.toString(), "25000.25");
    assert.equal(db.records.positionHistory[0].userId, userId);
});

test("PUT replaces editable fields and valuation timestamp while preserving identity", async () => {
    const records = emptyRecords();
    records.investments = [investment(), investment("foreign", "foreign")];
    const db = setup(records);
    const result = await request("PUT", { name: "Renamed", type: "Index fund", value: 69.50 });
    assert.equal(result.status, 200);
    assert.equal(result.body.investment.id, "owned");
    assert.equal(result.body.investment.name, "Renamed");
    assert.equal(result.body.investment.type, "Index fund");
    assert.equal(result.body.investment.valuationSnapshot, 69.5);
    assert.equal(result.body.investment.createdAt, oldTime.toISOString());
    assert.ok(Date.parse(result.body.investment.updatedAt) > oldTime.getTime());
    assert.ok(Date.parse(result.body.investment.valuationSnapshotAt) > oldTime.getTime());
    const update = db.calls.find((call) => call.method === "investment.updateMany");
    assert.deepEqual(update.query.where, { id: "owned", userId });
    assert.deepEqual(Object.keys(update.query.data).sort(), ["name", "type", "valuationSnapshot", "valuationSnapshotAt"]);
    assert.equal(db.records.investments.find((row) => row.id === "foreign").valuationSnapshot.toString(), "100");
    assert.equal(db.records.positionHistory[0].investments.toString(), "69.5");
});

test("investment types remain trimmed free text rather than a fixed asset enum", async () => {
    for (const type of ["Cryptocurrency", "Mutual fund", "Other custom holding"]) {
        setup();
        const result = await request("POST", { ...validInput, type: ` ${type} ` });
        assert.equal(result.status, 201);
        assert.equal(result.body.investment.type, type);
    }
});

test("strict create/PUT bodies reject invalid money, missing fields and server-controlled properties", async () => {
    const invalid = [
        {}, null, [], { name: "Missing type", value: 1 }, { type: "Missing name", value: 1 },
        { name: "Missing value", type: "Fund" }, { ...validInput, name: " " }, { ...validInput, type: " " },
        { ...validInput, name: "a".repeat(101) }, { ...validInput, type: "a".repeat(101) },
        { ...validInput, value: -1 }, { ...validInput, value: 0.001 },
        { ...validInput, value: "100" }, { ...validInput, value: null },
        { ...validInput, value: 0.1 + 0.2 }, { ...validInput, value: 1e16 },
        ...["id", "userId", "createdAt", "updatedAt", "valuationSnapshot", "valuationSnapshotAt", "unexpected"]
            .map((field) => ({ ...validInput, [field]: "forged" })),
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

test("invalid identifiers fail before starting a mutation", async () => {
    for (const method of ["PUT", "DELETE"]) {
        for (const id of ["", " ", "a".repeat(192)]) {
            const db = setup();
            assert.equal((await request(method, validInput, id)).status, 400);
            assert.equal(db.options.length, 0);
        }
    }
});

test("foreign and missing investments have identical 404 responses without history or reference lookups", async () => {
    for (const method of ["PUT", "DELETE"]) {
        for (const id of ["missing", "foreign"]) {
            const records = emptyRecords();
            records.investments = [investment("foreign", "foreign")];
            const db = setup(records);
            const result = await request(method, validInput, id);
            assert.deepEqual(result, { status: 404, body: { error: "NOT_FOUND", message: "Investment not found." } });
            assert.equal(db.records.investments.length, 1);
            assert.equal(db.records.positionHistory.length, 0);
            assert.equal(db.calls.some((call) => call.method === "financeTransaction.findFirst"), false);
        }
    }
});

test("any referenced transaction blocks deletion, including cross-owner references", async () => {
    for (const reference of [
        transaction(), transaction({ type: "investment_sale" }), transaction({ userId: "foreign" }),
    ]) {
        const records = emptyRecords();
        records.investments = [investment()];
        records.transactions = [reference];
        const db = setup(records);
        const result = await request("DELETE");
        assert.equal(result.status, 409);
        assert.equal(result.body.error, "INVESTMENT_HAS_TRANSACTIONS");
        assert.equal(result.body.message, "This investment has transactions. Delete those transactions first.");
        assert.equal(db.records.investments.length, 1);
        assert.deepEqual(db.records.transactions, [reference]);
        assert.equal(db.records.positionHistory.length, 0);
        assert.equal(db.calls.some((call) => call.method === "investment.deleteMany"), false);
    }
});

function ledgerRecords() {
    const records = emptyRecords();
    records.accounts = [{
        id: "bank", userId, name: "Everyday", balanceSnapshot: new Decimal("100"),
        balanceSnapshotAt: oldTime, createdAt: oldTime, updatedAt: oldTime,
    }];
    records.investments = [investment()];
    records.liabilities = [{
        id: "loan", userId, name: "Loan", type: "Loan", balance: new Decimal("20"),
        monthlyPayment: null, createdAt: oldTime, updatedAt: oldTime,
    }];
    return records;
}

test("an unreferenced investment deletes atomically while unrelated ledgers remain intact", async () => {
    const records = ledgerRecords();
    records.investments.push(investment("remaining"));
    records.transactions = [transaction({ investmentId: "remaining" })];
    const db = setup(records);
    assert.deepEqual(await request("DELETE"), { status: 200, body: { success: true } });
    assert.deepEqual(db.records.investments.map((row) => row.id), ["remaining"]);
    const snapshot = db.records.positionHistory[0];
    assert.equal(snapshot.bank.toString(), "90");
    assert.equal(snapshot.investments.toString(), "110");
    assert.equal(snapshot.debt.toString(), "20");
    assert.deepEqual(db.records.transactions, records.transactions);
    assert.ok(db.calls.findIndex((call) => call.method === "investment.deleteMany") <
        db.calls.findIndex((call) => call.method === "financialPositionSnapshot.create"));
});

test("zero valuations and deletion of the last holding capture real zero positions", async () => {
    const records = emptyRecords();
    records.investments = [investment()];
    const db = setup(records);
    assert.equal((await request("PUT", { ...validInput, value: 0 })).status, 200);
    assert.equal(db.records.positionHistory[0].investments.toString(), "0");
    assert.equal((await request("DELETE")).status, 200);
    assert.equal(db.records.investments.length, 0);
    assert.equal(db.records.positionHistory[1].investments.toString(), "0");
    const emptyDb = setup();
    assert.equal((await request("POST", { ...validInput, value: 0 })).status, 201);
    assert.equal(emptyDb.records.positionHistory[0].investments.toString(), "0");
});

test("a simulated reference after the dependency check returns safe FK conflict feedback", async () => {
    const records = emptyRecords();
    records.investments = [investment()];
    const db = setup(records, { insertReferenceBeforeDelete: true });
    const result = await request("DELETE");
    assert.equal(result.status, 409);
    assert.equal(result.body.error, "INVESTMENT_HAS_TRANSACTIONS");
    assert.equal(JSON.stringify(result.body).includes("PRIVATE_FOREIGN_KEY_DIAGNOSTIC"), false);
    assert.equal(db.records.investments.length, 1);
    assert.equal(db.records.positionHistory.length, 0);
    assert.ok(db.calls.some((call) => call.method === "investment.deleteMany"));
});

test("mutation, reference-read, aggregate-read and history failures leave staged records uncommitted", async () => {
    const previousError = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args);
    let attempts = 0;
    try {
        for (const method of ["POST", "PUT", "DELETE"]) {
            const operation = method === "POST" ? "investment.create"
                : method === "PUT" ? "investment.updateMany" : "investment.deleteMany";
            const failures = [operation, "investment.findMany", "financialPositionSnapshot.create"];
            if (method === "DELETE") failures.push("financeTransaction.findFirst");
            for (const failAt of failures) {
                attempts++;
                const records = emptyRecords();
                records.investments = [investment()];
                const db = setup(records, { failAt });
                const result = await request(method);
                assert.equal(result.status, 500);
                assert.equal(result.body.error, "INTERNAL_SERVER_ERROR");
                assert.equal(JSON.stringify(result.body).includes("PRIVATE_DATABASE_DIAGNOSTIC"), false);
                assert.deepEqual(db.records.investments, records.investments);
                assert.equal(db.records.positionHistory.length, 0);
                assert.equal(db.options.length, 1);
                if (failAt === operation || failAt === "financeTransaction.findFirst") {
                    assert.equal(db.calls.some((call) => call.method === "financialPositionSnapshot.create"), false);
                }
            }
        }
        assert.equal(errors.length, attempts);
    } finally {
        console.error = previousError;
    }
});

test("unrelated FK failures and deadlocks remain generic errors without retries", async () => {
    const previousError = console.error;
    console.error = () => {};
    try {
        for (const [failAt, errorCode] of [
            ["investment.deleteMany", "P2034"],
            ["financialPositionSnapshot.create", "P2003"],
        ]) {
            const records = emptyRecords();
            records.investments = [investment()];
            const db = setup(records, { failAt, errorCode });
            assert.equal((await request("DELETE")).status, 500);
            assert.equal(db.options.length, 1);
            assert.equal(db.records.investments.length, 1);
            assert.equal(db.records.positionHistory.length, 0);
        }
    } finally {
        console.error = previousError;
    }
});

test("auth failures are generic and do not access database services", async () => {
    const db = setup();
    dependencies.getSession = async () => {
        throw new Error("PRIVATE_AUTH_DIAGNOSTIC");
    };
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

test("service rejects an empty authenticated identity before starting a transaction", async () => {
    const db = setup();
    await assert.rejects(mutateInvestment(db.client, " ", { kind: "create", input: validInput }), /authenticated user/);
    assert.equal(db.options.length, 0);
});

test("existing purchases and sales affect bank and investment once, with debt in net worth", async () => {
    const records = ledgerRecords();
    records.transactions = [
        transaction({ id: "purchase", amount: new Decimal("10.10") }),
        transaction({ id: "sale", type: "investment_sale", amount: new Decimal("2.20") }),
    ];
    const db = setup(records);
    assert.equal((await request("POST", { ...validInput, value: 0 })).status, 201);
    const snapshot = db.records.positionHistory[0];
    assert.equal(snapshot.bank.toString(), "92.1");
    assert.equal(snapshot.investments.toString(), "107.9");
    assert.equal(snapshot.debt.toString(), "20");
    assert.equal(snapshot.bank.plus(snapshot.investments).minus(snapshot.debt).toString(), "180");
    const frontend = financialSnapshot(toFinanceDataResponse(db.records));
    assert.equal(frontend.netWorth, 180);

    // Revaluation absorbs earlier trade effects without moving bank money again.
    assert.equal((await request("PUT", { ...validInput, value: 150 })).status, 200);
    const updated = db.records.positionHistory[1];
    assert.equal(updated.bank.toString(), "92.1");
    assert.equal(updated.investments.toString(), "150");
    assert.equal(updated.debt.toString(), "20");
    assert.equal(updated.bank.plus(updated.investments).minus(updated.debt).toString(), "222.1");
    assert.deepEqual(db.records.transactions, records.transactions);
    assert.equal(db.records.positionHistory[0].investments.toString(), "107.9");
});

test("replacement valuations exclude earlier/equal trades and apply subsequent purchases/sales once", async () => {
    const records = ledgerRecords();
    records.transactions = [transaction({ id: "older-purchase" }), transaction({ id: "older-sale", type: "investment_sale" })];
    const db = setup(records, {
        onUpdate(staged, fields) {
            // Deterministic cutoff fixtures, not an actual concurrent transaction API.
            staged.transactions.push(transaction({ id: "equal", recordedAt: fields.valuationSnapshotAt }));
            staged.transactions.push(transaction({
                id: "purchase-after", amount: new Decimal("3.10"),
                recordedAt: new Date(fields.valuationSnapshotAt.getTime() + 1),
            }));
            staged.transactions.push(transaction({
                id: "sale-after", type: "investment_sale", amount: new Decimal("1.10"),
                recordedAt: new Date(fields.valuationSnapshotAt.getTime() + 2),
            }));
        },
    });
    assert.equal((await request("PUT", { ...validInput, value: 200 })).status, 200);
    const snapshot = db.records.positionHistory[0];
    assert.equal(snapshot.investments.toString(), "202");
    // The bank's earlier independent snapshot still includes all later recorded effects.
    assert.equal(snapshot.bank.toString(), "88");
    const data = toFinanceDataResponse(db.records);
    assert.equal(investmentValue(data.investments[0], data.transactions), 202);
    assert.deepEqual(db.records.transactions.slice(0, 2), records.transactions);
});

test("unrepresentable position totals roll back an otherwise valid investment creation", async () => {
    const records = emptyRecords();
    records.investments = [{ ...investment(), valuationSnapshot: new Decimal("90071992547409.90") }];
    const db = setup(records);
    const previousError = console.error;
    console.error = () => {};
    try {
        assert.equal((await request("POST", { ...validInput, value: 1 })).status, 500);
        assert.equal(db.records.investments.length, 1);
        assert.equal(db.records.positionHistory.length, 0);
    } finally {
        console.error = previousError;
    }
});

