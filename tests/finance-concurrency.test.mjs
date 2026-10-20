import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { database, records, userId } from "./helpers/finance-transaction-database.mjs";

const dependencies = {};
const key = "lifeos.finance-concurrency-tests";
globalThis[Symbol.for(key)] = dependencies;
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "@/lib/auth" || specifier === "@/lib/prisma") {
            const source = specifier.endsWith("auth")
                ? `export const auth = { api: { getSession: async () => ({ user: { id: "${userId}" } }) } };`
                : `export const prisma = { $transaction: (...args) => globalThis[Symbol.for("${key}")].transaction(...args) };`;
            return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        }
        const match = specifier.match(/^@\/features\/finance\/server\/(account|investment|liability|transaction)-handler$/);
        if (match) {
            return nextResolve(new URL(`../src/features/finance/server/${match[1]}-handler.ts`, import.meta.url).href, context);
        }
        if (specifier === "next/server") return nextResolve("next/server.js", context);
        return nextResolve(specifier, context);
    },
});

const routes = {};
for (const resource of ["accounts", "investments", "liabilities", "transactions"]) {
    routes[resource] = {
        collection: await import(`../src/app/api/finance/${resource}/route.ts`),
        item: await import(`../src/app/api/finance/${resource}/[id]/route.ts`),
    };
}
const { financeConcurrencyError, financeMutationDiagnostics } = await import(
    "../src/features/finance/server/finance-concurrency.ts"
);
const bodies = {
    accounts: { name: "Bank", balance: 100 },
    investments: { name: "Holding", type: "Other", value: 100 },
    liabilities: { name: "Loan", type: "Other", balance: 100 },
    transactions: { type: "expense", description: "Groceries", amount: 80, date: "2026-10-20", accountId: "bank", category: "Food" },
};
const conflictBody = {
    error: "CONCURRENT_MODIFICATION",
    message: "Your financial data changed during this operation. Please refresh and try again.",
};
function databaseError(code = "P2034") {
    return new PrismaClientKnownRequestError("SQL and confidential parameters must not be logged", {
        code,
        clientVersion: "7.10.1",
        meta: {
            modelName: "FinanceTransaction",
            driverAdapterError: {
                name: "DriverAdapterError",
                cause: {
                    kind: "TransactionWriteConflict",
                    originalCode: "1213",
                    originalMessage: "Sensitive database diagnostic",
                },
            },
        },
    });
}
async function request(resource, method, body = bodies[resource]) {
    const req = new Request(`http://localhost/api/finance/${resource}/owned`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method !== "DELETE" ? { body: JSON.stringify(body) } : {}),
    });
    const response = method === "POST"
        ? await routes[resource].collection.POST(req)
        : await routes[resource].item[method](req, { params: Promise.resolve({ id: "owned" }) });
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    return { status: response.status, body: await response.json() };
}

for (const resource of Object.keys(routes)) {
    for (const method of ["POST", "PUT", "DELETE"]) {
        test(`${method} ${resource} maps the reproduced MySQL/Prisma conflict to a safe 409`, async (context) => {
            const warnings = [];
            context.mock.method(console, "warn", (...args) => warnings.push(args));
            dependencies.transaction = async () => { throw databaseError(); };
            const result = await request(resource, method);
            assert.deepEqual(result, { status: 409, body: conflictBody });
            assert.equal(warnings.length, 1);
            assert.deepEqual(warnings[0][1], {
                errorClass: "PrismaClientKnownRequestError", prismaCode: "P2034",
            });
            assert.doesNotMatch(JSON.stringify(warnings), /confidential|Sensitive|SQL|parameters|originalMessage/);
        });
    }
    test(`${resource} keeps unexpected database failures as sanitized 500 errors`, async (context) => {
        const errors = [];
        context.mock.method(console, "error", (...args) => errors.push(args));
        for (const failure of [databaseError("P2002"), databaseError("P2010"), databaseError("P2028"), new Error("Secret failure"), { code: "P2034" }]) {
            dependencies.transaction = async () => { throw failure; };
            const result = await request(resource, "POST");
            assert.equal(result.status, 500);
            assert.equal(result.body.error, "INTERNAL_SERVER_ERROR");
            assert.doesNotMatch(JSON.stringify(result), /Secret|Sensitive|SQL|parameters|P20/);
        }
        assert.equal(errors.length, 5);
        assert.doesNotMatch(JSON.stringify(errors), /Secret|Sensitive|SQL|parameters|originalMessage/);
    });
}

test("conflict after staged transaction/history writes commits neither and does not retry", async (context) => {
    context.mock.method(console, "warn", () => { });
    const original = records();
    const db = database(original);
    let attempts = 0;
    dependencies.transaction = (callback, options) => db.client.$transaction(async (tx) => {
        attempts++;
        const createSnapshot = tx.financialPositionSnapshot.create;
        tx.financialPositionSnapshot.create = async (query) => {
            await createSnapshot(query);
            throw databaseError();
        };
        return callback(tx);
    }, options);
    const result = await request("transactions", "POST");
    assert.deepEqual(result, { status: 409, body: conflictBody });
    assert.equal(attempts, 1);
    assert.deepEqual(db.options, [{ isolationLevel: "Serializable" }]);
    assert.ok(db.calls.some((call) => call.method === "financeTransaction.create"));
    assert.ok(db.calls.some((call) => call.method === "financialPositionSnapshot.create"));
    assert.deepEqual(db.records, original);
    assert.equal(db.records.transactions.length, 0);
    assert.equal(db.records.positionHistory.length, 0);
});

test("existing ledger validation retains NEGATIVE_BALANCE and writes no history", async () => {
    const db = database();
    dependencies.transaction = (...args) => db.client.$transaction(...args);
    const result = await request("transactions", "POST", { ...bodies.transactions, amount: 101 });
    assert.equal(result.status, 409);
    assert.equal(result.body.error, "NEGATIVE_BALANCE");
    assert.equal(db.records.transactions.length, 0);
    assert.equal(db.records.positionHistory.length, 0);
});

test("normalization only accepts the positively identified Prisma error, without message matching", () => {
    assert.deepEqual(financeConcurrencyError(databaseError()), conflictBody);
    for (const error of [null, undefined, { code: "P2034" }, databaseError("P2003"), new Error("Deadlock found 1213 P2034")]) {
        assert.equal(financeConcurrencyError(error), null);
    }
    assert.deepEqual(financeMutationDiagnostics(new Error("Private context")), { errorClass: "Error" });
});
