import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { Decimal } from "@prisma/client/runtime/client";

const routeUrl = new URL("../src/app/api/finance/route.ts", import.meta.url).href;
const readModuleUrl = new URL("../src/features/finance/server/finance-read.ts", import.meta.url).href;
const stateKey = "lifeos.finance-read-test.dependencies";
const dependencies = {};
globalThis[Symbol.for(stateKey)] = dependencies;

// Import the actual route with only the external auth/database boundaries replaced.
// No connection configuration, real sessions, browser storage, or MySQL records are used.
const authStub = `
    export const auth = {
        api: {
            getSession: (input) => globalThis[Symbol.for(${JSON.stringify(stateKey)})].getSession(input),
        },
    };
`;
const prismaStub = `
    export const prisma = {
        $transaction: (...args) => globalThis[Symbol.for(${JSON.stringify(stateKey)})].database.client.$transaction(...args),
    };
`;
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (context.parentURL === routeUrl) {
            if (specifier === "@/lib/auth" || specifier === "@/lib/prisma") {
                const source = specifier === "@/lib/auth" ? authStub : prismaStub;
                return {
                    url: `data:text/javascript,${encodeURIComponent(source)}`,
                    shortCircuit: true,
                };
            }
            if (specifier === "@/features/finance/server/finance-read") {
                return nextResolve(readModuleUrl, context);
            }
            if (specifier === "@/lib/server/error-diagnostics") {
                return nextResolve(
                    new URL("../src/lib/server/error-diagnostics.ts", import.meta.url).href,
                    context,
                );
            }
            if (specifier === "next/server") {
                return nextResolve("next/server.js", context);
            }
        }
        return nextResolve(specifier, context);
    },
});

const route = await import(routeUrl);
const { readFinanceForUser } = await import(readModuleUrl);
const recordedAt = new Date("2026-10-01T10:00:00.123Z");
const later = new Date("2026-10-02T10:00:00.123Z");
const userId = "user-a";
const otherUserId = "user-b";
const models = [
    ["bankAccount", "accounts"],
    ["investment", "investments"],
    ["liability", "liabilities"],
    ["financeTransaction", "transactions"],
    ["financialPositionSnapshot", "positionHistory"],
];
const entityOrder = [{ createdAt: "asc" }, { id: "asc" }];
const transactionOrder = [{ date: "desc" }, { recordedAt: "desc" }, { id: "asc" }];
const positionOrder = [{ recordedAt: "asc" }, { id: "asc" }];

function emptyRecords() {
    return { accounts: [], investments: [], liabilities: [], transactions: [], positionHistory: [] };
}

function recordsForTwoUsers() {
    const fields = { userId, name: "Owned record", createdAt: recordedAt, updatedAt: later };
    const account = {
        ...fields, id: "account-a", balanceSnapshot: new Decimal("1234.56"), balanceSnapshotAt: recordedAt,
    };
    const investment = {
        ...fields, id: "investment-a", type: "Cryptocurrency",
        valuationSnapshot: new Decimal("500.25"), valuationSnapshotAt: recordedAt,
    };
    const liability = {
        ...fields, id: "liability-a", type: "Bike loan", balance: new Decimal("200.50"), monthlyPayment: null,
    };
    const transaction = {
        id: "transaction-a", userId, type: "income", amount: new Decimal("100.25"),
        description: "Owned income", date: new Date("2026-10-20T00:00:00.000Z"),
        recordedAt, accountId: account.id, category: null, destinationAccountId: null,
        investmentId: null, note: null,
    };
    const position = {
        id: "position-a", userId, recordedAt,
        bank: new Decimal("1234.56"), investments: new Decimal("500.25"), debt: new Decimal("200.50"),
    };

    return {
        accounts: [
            { ...account, id: "account-z" },
            { ...account, id: "foreign-account", userId: otherUserId, name: "FOREIGN_PRIVATE_DATA" },
            account,
        ],
        investments: [investment, { ...investment, id: "foreign-investment", userId: otherUserId }],
        liabilities: [liability, { ...liability, id: "foreign-liability", userId: otherUserId }],
        transactions: [
            { ...transaction, id: "transaction-z", date: new Date("2026-10-19T00:00:00.000Z") },
            { ...transaction, id: "transaction-b" },
            { ...transaction, id: "foreign-transaction", userId: otherUserId, accountId: "foreign-account" },
            transaction,
            { ...transaction, id: "transaction-c", recordedAt: later },
        ],
        positionHistory: [
            { ...position, id: "position-z", recordedAt: later },
            { ...position, id: "position-b" },
            { ...position, id: "foreign-position", userId: otherUserId },
            position,
        ],
    };
}

function createDatabase(records = emptyRecords(), failureModel) {
    const calls = [];
    const transactions = [];
    let active = false;
    const delegates = Object.fromEntries(models.map(([model, collection]) => [model, {
        async findMany(query) {
            assert.equal(active, true, "Every read must execute inside the transaction");
            assert.deepEqual(query.where, { userId });
            calls.push({ model, query });
            if (failureModel === model) throw new Error("Private database diagnostic");
            // Minimal query double; assertions below also verify the exact Prisma ordering clauses.
            return records[collection].filter((row) => row.userId === query.where.userId)
                .sort((left, right) => {
                    for (const order of query.orderBy) {
                        const [field, direction] = Object.entries(order)[0];
                        const a = left[field] instanceof Date ? left[field].getTime() : left[field];
                        const b = right[field] instanceof Date ? right[field].getTime() : right[field];
                        const difference = a < b ? -1 : a > b ? 1 : 0;
                        if (difference) return direction === "asc" ? difference : -difference;
                    }
                    return 0;
                });
        },
    }]));

    return {
        calls,
        transactions,
        client: {
            async $transaction(callback, options) {
                transactions.push(options);
                active = true;
                try {
                    return await callback(delegates);
                } finally {
                    active = false;
                }
            },
        },
    };
}

function authenticated(database = createDatabase()) {
    dependencies.database = database;
    dependencies.getSession = async () => ({ user: { id: userId } });
    return database;
}

function assertNoStore(response, status) {
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.match(response.headers.get("content-type"), /application\/json/);
}

test("route exposes only GET with dynamic Node.js configuration", () => {
    assert.deepEqual(Object.keys(route).sort(), ["GET", "dynamic", "runtime"]);
    assert.equal(route.runtime, "nodejs");
    assert.equal(route.dynamic, "force-dynamic");
});

test("unauthenticated requests return 401 without reading Finance", async () => {
    const database = authenticated();
    const request = new Request("http://localhost/api/finance?userId=user-b");
    dependencies.getSession = async ({ headers }) => {
        assert.equal(headers, request.headers);
        return null;
    };
    const response = await route.GET(request);
    assertNoStore(response, 401);
    assert.deepEqual(await response.json(), {
        error: "UNAUTHORIZED", message: "Please sign in to access your finance data.",
    });
    assert.equal(database.calls.length, 0);
    assert.equal(database.transactions.length, 0);
});

test("an authenticated empty database returns five empty arrays without writes or seeds", async () => {
    const database = authenticated();
    const response = await route.GET(new Request("http://localhost/api/finance"));
    assertNoStore(response, 200);
    assert.deepEqual(await response.json(), emptyRecords());
    assert.equal(database.calls.length, 5);
    assert.deepEqual(database.transactions, [{ isolationLevel: "RepeatableRead" }]);
});

test("only session identity scopes all five queries, ignoring supplied user identity", async () => {
    const database = authenticated(createDatabase(recordsForTwoUsers()));
    const request = new Request("http://localhost/api/finance?userId=user-b");
    let bodyReads = 0;
    request.json = async () => {
        bodyReads += 1;
        return { userId: otherUserId };
    };
    dependencies.getSession = async ({ headers }) => {
        assert.equal(headers, request.headers);
        return { user: { id: userId } };
    };
    const response = await route.GET(request);
    assertNoStore(response, 200);
    const body = await response.json();
    assert.deepEqual(database.calls.map(({ model }) => model), models.map(([model]) => model));
    for (const { query } of database.calls) assert.deepEqual(query.where, { userId });
    assert.equal(bodyReads, 0);
    assert.equal(JSON.stringify(body).includes("foreign-"), false);
    assert.equal(JSON.stringify(body).includes("FOREIGN_PRIVATE_DATA"), false);
    assert.equal(JSON.stringify(body).includes('"userId"'), false);
    assert.equal(body.investments.length, 1);
    assert.equal(body.liabilities.length, 1);
});

test("query ordering is deterministic for equal transaction and position timestamps", async () => {
    const database = createDatabase(recordsForTwoUsers());
    const data = await readFinanceForUser(database.client, userId);
    for (const { model, query } of database.calls) {
        const expected = model === "financeTransaction" ? transactionOrder
            : model === "financialPositionSnapshot" ? positionOrder : entityOrder;
        assert.deepEqual(query.orderBy, expected);
    }
    assert.deepEqual(data.accounts.map(({ id }) => id), ["account-a", "account-z"]);
    assert.deepEqual(data.transactions.map(({ id }) => id), [
        "transaction-c", "transaction-a", "transaction-b", "transaction-z",
    ]);
    assert.deepEqual(data.positionHistory.map(({ id }) => id), ["position-a", "position-b", "position-z"]);
    assert.deepEqual(database.transactions, [{ isolationLevel: "RepeatableRead" }]);
});

test("GET uses existing DTO conversions and preserves date-only and timestamp fields", async () => {
    authenticated(createDatabase(recordsForTwoUsers()));
    const response = await route.GET(new Request("http://localhost/api/finance"));
    assertNoStore(response, 200);
    const data = await response.json();
    assert.equal(data.accounts[0].balanceSnapshot, 1234.56);
    assert.equal(data.accounts[0].balanceSnapshotAt, recordedAt.toISOString());
    assert.equal(data.accounts[0].createdAt, recordedAt.toISOString());
    assert.equal(data.accounts[0].updatedAt, later.toISOString());
    assert.equal(data.investments[0].valuationSnapshot, 500.25);
    assert.equal(data.investments[0].valuationSnapshotAt, recordedAt.toISOString());
    assert.equal(data.liabilities[0].balance, 200.5);
    assert.equal("monthlyPayment" in data.liabilities[0], false);
    const entry = data.transactions.find(({ id }) => id === "transaction-a");
    assert.equal(entry.amount, 100.25);
    assert.equal(entry.date, "2026-10-20");
    assert.equal(entry.recordedAt, recordedAt.toISOString());
    assert.equal("note" in entry, false);
    assert.deepEqual(data.positionHistory[0], {
        id: "position-a", recordedAt: recordedAt.toISOString(),
        bank: 1234.56, investments: 500.25, debt: 200.5,
    });
});

test("an empty identity fails closed before any database read", async () => {
    const database = createDatabase();
    await assert.rejects(() => readFinanceForUser(database.client, " "));
    assert.equal(database.calls.length, 0);
    assert.equal(database.transactions.length, 0);
});

test("authentication failures return a generic no-store 500 and redact diagnostics", async (context) => {
    const database = authenticated();
    const failure = new Error("Private authentication diagnostic");
    dependencies.getSession = async () => { throw failure; };
    const logger = context.mock.method(console, "error", () => {});
    const response = await route.GET(new Request("http://localhost/api/finance"));
    assertNoStore(response, 500);
    assert.deepEqual(await response.json(), {
        error: "INTERNAL_SERVER_ERROR", message: "Unable to load your finance data.",
    });
    assert.equal(database.calls.length, 0);
    assert.deepEqual(logger.mock.calls[0].arguments, [
        "[GET /api/finance]", { errorClass: "Error" },
    ]);
    assert.doesNotMatch(
        JSON.stringify(logger.mock.calls[0].arguments),
        /Private authentication diagnostic|stack/,
    );
});

test("database failures return no partial data or private diagnostics", async (context) => {
    const database = authenticated(createDatabase(recordsForTwoUsers(), "liability"));
    const logger = context.mock.method(console, "error", () => {});
    const response = await route.GET(new Request("http://localhost/api/finance"));
    assertNoStore(response, 500);
    assert.deepEqual(await response.json(), {
        error: "INTERNAL_SERVER_ERROR", message: "Unable to load your finance data.",
    });
    assert.equal(database.calls.length, 3);
    assert.equal(logger.mock.callCount(), 1);
});

test("serialization failures are handled consistently without exposing raw records", async (context) => {
    const records = recordsForTwoUsers();
    records.accounts[0].balanceSnapshot = new Decimal("0.001");
    authenticated(createDatabase(records));
    const logger = context.mock.method(console, "error", () => {});
    const response = await route.GET(new Request("http://localhost/api/finance"));
    assertNoStore(response, 500);
    assert.deepEqual(await response.json(), {
        error: "INTERNAL_SERVER_ERROR", message: "Unable to load your finance data.",
    });
    assert.equal(logger.mock.callCount(), 1);
});
