import "./helpers/register-typescript.mjs";
import { sameOriginHeaders } from "./helpers/mutation-request.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { Decimal } from "@prisma/client/runtime/client";

const stateKey = "lifeos.account-tests.dependencies";
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
        if (specifier === "@/features/finance/server/account-handler") {
            return nextResolve(new URL("../src/features/finance/server/account-handler.ts", import.meta.url).href, context);
        }
        if (specifier === "next/server") return nextResolve("next/server.js", context);
        return nextResolve(specifier, context);
    },
});

const collectionRoute = await import("../src/app/api/finance/accounts/route.ts");
const itemRoute = await import("../src/app/api/finance/accounts/[id]/route.ts");
const { mutateAccount } = await import("../src/features/finance/server/account-mutations.ts");
const { accountBalance } = await import("../src/features/finance/utils/finance-calculations.ts");
const { toFinanceDataResponse } = await import("../src/features/finance/server/finance-dto.ts");

const userId = "user-a";
const oldTime = new Date("2020-01-01T00:00:00.000Z");
const validInput = { name: "Everyday", balance: 25000.25 };

function account(id = "owned", owner = userId) {
    return {
        id, userId: owner, name: "Original", balanceSnapshot: new Decimal("100"),
        balanceSnapshotAt: oldTime, createdAt: oldTime, updatedAt: oldTime,
    };
}

function transaction(overrides = {}) {
    return {
        id: "record", userId, type: "expense", amount: new Decimal("10"),
        description: "Recorded expense", date: new Date("2099-01-01T00:00:00.000Z"),
        recordedAt: new Date("2020-02-01T00:00:00.000Z"), accountId: "owned",
        destinationAccountId: null, investmentId: null, category: "Other", note: null,
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
                const matches = (row, where) => Object.entries(where).every(([key, value]) =>
                    key === "OR" ? value.some((condition) => matches(row, condition)) : row[key] === value);
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
                Object.assign(tx.bankAccount, {
                    async create(query) {
                        log("bankAccount.create", query);
                        assert.equal(query.data.userId, userId);
                        const now = new Date();
                        const row = {
                            ...query.data, id: `generated-${++serial}`,
                            balanceSnapshot: new Decimal(query.data.balanceSnapshot),
                            createdAt: now, updatedAt: now,
                        };
                        staged.accounts.push(row);
                        return row;
                    },
                    async updateMany(query) {
                        log("bankAccount.updateMany", query);
                        assert.equal(query.where.userId, userId);
                        settings.onUpdate?.(staged, query.data);
                        let count = 0;
                        staged.accounts = staged.accounts.map((row) => {
                            if (!matches(row, query.where)) return row;
                            count++;
                            return {
                                ...row, ...query.data,
                                balanceSnapshot: new Decimal(query.data.balanceSnapshot),
                                updatedAt: new Date(),
                            };
                        });
                        return { count };
                    },
                    async findFirst(query) {
                        log("bankAccount.findFirst", query);
                        assert.equal(query.where.userId, userId);
                        return staged.accounts.find((row) => matches(row, query.where)) ?? null;
                    },
                    async deleteMany(query) {
                        log("bankAccount.deleteMany", query);
                        assert.equal(query.where.userId, userId);
                        if (settings.insertReferenceBeforeDelete) {
                            staged.transactions.push(transaction({ accountId: query.where.id }));
                        }
                        const matched = staged.accounts.filter((row) => matches(row, query.where));
                        if (matched.some((row) => staged.transactions.some((entry) =>
                            entry.accountId === row.id || entry.destinationAccountId === row.id))) {
                            throw Object.assign(new Error("PRIVATE_FOREIGN_KEY_DIAGNOSTIC"), { code: "P2003" });
                        }
                        staged.accounts = staged.accounts.filter((row) => !matches(row, query.where));
                        return { count: matched.length };
                    },
                });
                tx.financeTransaction.findFirst = async (query) => {
                    log("financeTransaction.findFirst", query);
                    assert.deepEqual(query, {
                        where: { OR: [{ accountId: "owned" }, { destinationAccountId: "owned" }] },
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
    const req = new Request(`http://localhost/api/finance/accounts/${id}?userId=foreign`, {
        method,
        headers: sameOriginHeaders({ "Content-Type": "application/json", Cookie: "test-session" }),
        ...(method !== "DELETE" ? { body: raw ? input : JSON.stringify(input) } : {}),
    });
    const response = method === "POST" ? await collectionRoute.POST(req)
        : await itemRoute[method](req, { params: Promise.resolve({ id }) });
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    return { status: response.status, body: await response.json() };
}

test("account routes expose only requested mutations with dynamic Node configuration", () => {
    assert.deepEqual(Object.keys(collectionRoute).sort(), ["POST", "dynamic", "runtime"]);
    assert.deepEqual(Object.keys(itemRoute).sort(), ["DELETE", "PUT", "dynamic", "runtime"]);
    for (const route of [collectionRoute, itemRoute]) {
        assert.equal(route.runtime, "nodejs");
        assert.equal(route.dynamic, "force-dynamic");
    }
});

test("all account mutations authenticate before parsing or accessing the database", async () => {
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

test("create maps exact balance and server snapshot time, with only session ownership", async () => {
    const db = setup();
    const before = Date.now();
    const result = await request("POST", { ...validInput, name: " Everyday " });
    const after = Date.now();
    assert.equal(result.status, 201);
    const dto = result.body.account;
    assert.equal(dto.id, "generated-1");
    assert.equal(dto.name, "Everyday");
    assert.equal(dto.balanceSnapshot, 25000.25);
    assert.equal(dto.userId, undefined);
    assert.ok(Date.parse(dto.balanceSnapshotAt) >= before && Date.parse(dto.balanceSnapshotAt) <= after);
    assert.equal(new Date(dto.createdAt).toISOString(), dto.createdAt);
    assert.equal(new Date(dto.updatedAt).toISOString(), dto.updatedAt);
    const create = db.calls.find((call) => call.method === "bankAccount.create");
    assert.deepEqual(Object.keys(create.query.data).sort(), ["balanceSnapshot", "balanceSnapshotAt", "name", "userId"]);
    assert.equal(create.query.data.balanceSnapshot, "25000.25");
    assert.equal(create.query.data.userId, userId);
    assert.deepEqual(db.options, [{ isolationLevel: "Serializable" }]);
    assert.equal(db.records.positionHistory.length, 1);
    assert.equal(db.records.positionHistory[0].bank.toString(), "25000.25");
    assert.equal(db.records.positionHistory[0].userId, userId);
});

test("PUT establishes a fresh snapshot while preserving identity and creation metadata", async () => {
    const records = emptyRecords();
    records.accounts = [account(), account("foreign", "foreign")];
    const db = setup(records);
    const result = await request("PUT", { name: "Renamed", balance: 69.50 });
    assert.equal(result.status, 200);
    assert.equal(result.body.account.id, "owned");
    assert.equal(result.body.account.name, "Renamed");
    assert.equal(result.body.account.balanceSnapshot, 69.5);
    assert.equal(result.body.account.createdAt, oldTime.toISOString());
    assert.ok(Date.parse(result.body.account.updatedAt) > oldTime.getTime());
    assert.ok(Date.parse(result.body.account.balanceSnapshotAt) > oldTime.getTime());
    const update = db.calls.find((call) => call.method === "bankAccount.updateMany");
    assert.deepEqual(update.query.where, { id: "owned", userId });
    assert.deepEqual(Object.keys(update.query.data).sort(), ["balanceSnapshot", "balanceSnapshotAt", "name"]);
    assert.equal(db.records.accounts.find((row) => row.id === "foreign").balanceSnapshot.toString(), "100");
    assert.equal(db.records.positionHistory[0].bank.toString(), "69.5");
});

test("new account snapshots exclude older and equal-time effects without rewriting the ledger", async () => {
    const records = emptyRecords();
    records.accounts = [account(), { ...account("savings"), balanceSnapshot: new Decimal("50") }];
    records.transactions = [
        transaction({ id: "expense" }),
        transaction({ id: "income", type: "income", amount: new Decimal("100") }),
        transaction({ id: "transfer", type: "transfer", destinationAccountId: "savings", category: null, amount: new Decimal("20") }),
    ];
    const db = setup(records, {
        onUpdate(staged, fields) {
            // Characterize the existing equality cutoff; this is not an actual concurrent write.
            staged.transactions.push(transaction({ id: "tie", recordedAt: fields.balanceSnapshotAt }));
            staged.transactions.push(transaction({
                id: "after", recordedAt: new Date(fields.balanceSnapshotAt.getTime() + 1),
                amount: new Decimal("0.25"),
            }));
        },
    });
    const result = await request("PUT", { name: "Updated balance", balance: 200 });
    assert.equal(result.status, 200);
    assert.equal(db.records.positionHistory[0].bank.toString(), "269.75");
    assert.deepEqual(db.records.transactions.slice(0, records.transactions.length), records.transactions);
    const data = toFinanceDataResponse(db.records);
    assert.equal(accountBalance(data.accounts[0], data.transactions), 199.75);
});

test("missing and foreign accounts return identical 404s without reference lookup or history", async () => {
    for (const method of ["PUT", "DELETE"]) {
        for (const id of ["missing", "foreign"]) {
            const records = emptyRecords();
            records.accounts = [account("foreign", "foreign")];
            const db = setup(records);
            const result = await request(method, validInput, id);
            assert.deepEqual(result, { status: 404, body: { error: "NOT_FOUND", message: "Bank account not found." } });
            assert.equal(db.records.positionHistory.length, 0);
            assert.equal(db.records.accounts.length, 1);
            assert.equal(db.calls.some((call) => call.method === "financeTransaction.findFirst"), false);
        }
    }
});

test("strict POST/PUT requests reject missing, negative, imprecise and server-controlled fields", async () => {
    const invalid = [
        {}, null, [], { name: "Required balance" }, { balance: 100 },
        { ...validInput, name: " " }, { ...validInput, name: "a".repeat(101) },
        { ...validInput, balance: -1 }, { ...validInput, balance: 0.001 },
        { ...validInput, balance: "100" }, { ...validInput, balance: null },
        { ...validInput, balance: 0.1 + 0.2 }, { ...validInput, balance: 1e16 },
        ...["id", "userId", "createdAt", "updatedAt", "balanceSnapshot", "balanceSnapshotAt", "unexpected"]
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

test("invalid IDs are rejected before starting a mutation", async () => {
    for (const method of ["PUT", "DELETE"]) {
        for (const id of ["", " ", "a".repeat(192)]) {
            const db = setup();
            const result = await request(method, validInput, id);
            assert.equal(result.status, 400);
            assert.equal(db.options.length, 0);
        }
    }
});

test("deletion rejects source and destination references, including cross-owner references", async () => {
    for (const reference of [
        transaction(),
        transaction({ type: "transfer", accountId: "other", destinationAccountId: "owned" }),
        transaction({ userId: "foreign", accountId: "owned" }),
    ]) {
        const records = emptyRecords();
        records.accounts = [account()];
        records.transactions = [reference];
        const db = setup(records);
        const result = await request("DELETE");
        assert.equal(result.status, 409);
        assert.equal(result.body.error, "ACCOUNT_HAS_TRANSACTIONS");
        assert.match(result.body.message, /Delete or move those transactions first/);
        assert.equal(db.records.accounts.length, 1);
        assert.deepEqual(db.records.transactions, [reference]);
        assert.equal(db.records.positionHistory.length, 0);
        assert.equal(db.calls.some((call) => call.method === "bankAccount.deleteMany"), false);
    }
});

test("an unreferenced account deletes successfully and history retains other assets and debt", async () => {
    const records = emptyRecords();
    records.accounts = [account(), { ...account("remaining"), balanceSnapshot: new Decimal("0.10") }];
    records.investments = [{
        id: "investment", userId, name: "Holding", type: "Cryptocurrency",
        valuationSnapshot: new Decimal("10.20"), valuationSnapshotAt: oldTime,
        createdAt: oldTime, updatedAt: oldTime,
    }];
    records.liabilities = [{
        id: "loan", userId, name: "Loan", type: "Loan", balance: new Decimal("3.30"),
        monthlyPayment: null, createdAt: oldTime, updatedAt: oldTime,
    }];
    records.transactions = [transaction({ accountId: "remaining", type: "income", amount: new Decimal("0.20") })];
    const db = setup(records);
    const result = await request("DELETE");
    assert.deepEqual(result, { status: 200, body: { success: true } });
    assert.deepEqual(db.records.accounts.map((row) => row.id), ["remaining"]);
    const snapshot = db.records.positionHistory[0];
    assert.equal(snapshot.bank.toString(), "0.3");
    assert.equal(snapshot.investments.toString(), "10.2");
    assert.equal(snapshot.debt.toString(), "3.3");
    assert.deepEqual(db.records.transactions, records.transactions);
    assert.ok(db.calls.findIndex((call) => call.method === "bankAccount.deleteMany") <
        db.calls.findIndex((call) => call.method === "financialPositionSnapshot.create"));
});

test("zero-balance accounts and deletion of the last account capture zero positions", async () => {
    const records = emptyRecords();
    records.accounts = [account()];
    const db = setup(records);
    assert.equal((await request("PUT", { ...validInput, balance: 0 })).status, 200);
    assert.equal(db.records.positionHistory[0].bank.toString(), "0");
    assert.equal((await request("DELETE")).status, 200);
    assert.equal(db.records.accounts.length, 0);
    assert.equal(db.records.positionHistory[1].bank.toString(), "0");
    const emptyDb = setup();
    assert.equal((await request("POST", { ...validInput, balance: 0 })).status, 201);
    assert.equal(emptyDb.records.positionHistory[0].bank.toString(), "0");
});

test("a simulated reference appearing after the check produces safe 409 via FK fallback", async () => {
    const records = emptyRecords();
    records.accounts = [account()];
    const db = setup(records, { insertReferenceBeforeDelete: true });
    const result = await request("DELETE");
    assert.equal(result.status, 409);
    assert.equal(result.body.error, "ACCOUNT_HAS_TRANSACTIONS");
    assert.equal(JSON.stringify(result.body).includes("PRIVATE_FOREIGN_KEY_DIAGNOSTIC"), false);
    assert.equal(db.records.accounts.length, 1);
    assert.equal(db.records.positionHistory.length, 0);
    assert.ok(db.calls.some((call) => call.method === "bankAccount.deleteMany"));
});

test("mutation, reference-read, aggregate-read and snapshot failures leave staged state uncommitted", async () => {
    const previousError = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args);
    let attempts = 0;
    try {
        for (const method of ["POST", "PUT", "DELETE"]) {
            const operation = method === "POST" ? "bankAccount.create"
                : method === "PUT" ? "bankAccount.updateMany" : "bankAccount.deleteMany";
            const failures = [operation, "bankAccount.findMany", "financialPositionSnapshot.create"];
            if (method === "DELETE") failures.push("financeTransaction.findFirst");
            for (const failAt of failures) {
                attempts++;
                const records = emptyRecords();
                records.accounts = [account()];
                const db = setup(records, { failAt });
                const result = await request(method);
                assert.equal(result.status, 500);
                assert.equal(result.body.error, "INTERNAL_SERVER_ERROR");
                assert.equal(JSON.stringify(result.body).includes("PRIVATE_DATABASE_DIAGNOSTIC"), false);
                assert.deepEqual(db.records.accounts, records.accounts);
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

test("unrelated FK failures and deadlocks retain generic error handling without retry", async () => {
    const previousError = console.error;
    console.error = () => {};
    try {
        for (const [failAt, errorCode] of [
            ["bankAccount.deleteMany", "P2034"],
            ["financialPositionSnapshot.create", "P2003"],
        ]) {
            const records = emptyRecords();
            records.accounts = [account()];
            const db = setup(records, { failAt, errorCode });
            const result = await request("DELETE");
            assert.equal(result.status, 500);
            assert.equal(db.options.length, 1);
            assert.equal(db.records.accounts.length, 1);
            assert.equal(db.records.positionHistory.length, 0);
        }
    } finally {
        console.error = previousError;
    }
});

test("auth failures return generic errors without database access", async () => {
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

test("services reject empty authenticated identities before starting a transaction", async () => {
    const db = setup();
    await assert.rejects(mutateAccount(db.client, " ", { kind: "create", input: validInput }), /authenticated user/);
    assert.equal(db.options.length, 0);
});
