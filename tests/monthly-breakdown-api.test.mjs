import "./helpers/register-typescript.mjs";
import { sameOriginHeaders } from "./helpers/mutation-request.mjs";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { registerHooks } from "node:module";
import { Decimal } from "@prisma/client/runtime/client";

const boundary = {};
const key = "lifeos.monthly-api-tests";
globalThis[Symbol.for(key)] = boundary;
const ref = `globalThis[Symbol.for(${JSON.stringify(key)})]`;
registerHooks({
    resolve(specifier, context, nextResolve) {
        let source;
        if (specifier === "@/lib/auth") source = `export const auth = {api:{getSession(){return ${ref}.session;}}};`;
        if (specifier === "@/lib/prisma") source = `export const prisma = ${ref}.client;`;
        if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        if (specifier === "@/lib/server/request-origin") return nextResolve(new URL("../src/lib/server/request-origin.ts", import.meta.url).href, context);
        if (specifier === "@/features/finance/monthly/server/handler") return nextResolve(new URL("../src/features/finance/monthly/server/handler.ts", import.meta.url).href, context);
        return nextResolve(specifier, context);
    },
});
const plans = new Map();
const categories = [];
const calls = [];
boundary.client = {
    monthlyFinanceSnapshot: {
        async findMany({ where }) {
            calls.push(["snapshots", where]);
            return where.userId === "owner" ? [{ month: "2026-10", categories: [{ name: "Food", amount: 10 }], total: new Decimal(10), income: new Decimal(100), left: new Decimal(90) }] : [];
        },
    },
    financeSpendingPlan: {
        async findUnique({ where }) { calls.push(["plan", where]); return plans.get(where.userId) ?? null; },
        async upsert({ where, create, update }) {
            calls.push(["upsert", where]);
            const row = { ...(plans.get(where.userId) ?? { ...create, referenceIncome: null }), ...update, updatedAt: new Date("2026-10-30T12:00:00Z") };
            plans.set(where.userId, row);
            return row;
        },
    },
    expenseCategory: {
        async findUnique({ where }) { return categories.find((row) => row.userId === where.userId_normalizedName.userId && row.normalizedName === where.userId_normalizedName.normalizedName) ?? null; },
        async create({ data }) { const row = { ...data, id: `category-${categories.length}` }; categories.push(row); return row; },
    },
    async $transaction(callback, options) {
        assert.equal(options.isolationLevel, "Serializable");
        return callback(boundary.client);
    },
};
const route = await import("../src/app/api/finance/monthly-breakdown/route.ts");
async function request(method, body, headers = sameOriginHeaders({ "Content-Type": "application/json" })) {
    const response = await route[method](new Request("http://localhost:3000/api/finance/monthly-breakdown?userId=foreign", {
        method, headers, ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
    }));
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    return { status: response.status, body: await response.json() };
}
beforeEach(() => {
    plans.clear(); categories.length = 0; calls.length = 0;
    boundary.session = { user: { id: "owner" } };
});

test("monthly API requires authentication and scopes every read/write to the session owner", async () => {
    boundary.session = null;
    assert.equal((await request("GET")).status, 401);
    assert.equal((await request("PUT", { targets: [] })).status, 401);
    assert.equal(calls.length, 0);
    boundary.session = { user: { id: "owner" } };
    const response = await request("GET");
    assert.equal(response.body.snapshots[0].total, 10);
    assert.equal(response.body.snapshots[0].left, 90);
    assert.ok(calls.every(([, where]) => where.userId === "owner"));
    const saved = await request("PUT", { targets: [{ name: "Food", amount: 500 }] });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.plan.targets[0].amount, 500);
    boundary.session = { user: { id: "other" } };
    assert.deepEqual((await request("GET")).body, { snapshots: [], plan: null });
    await request("PUT", { targets: [{ name: "Food", amount: 1 }] });
    assert.equal(plans.get("owner").targets[0].amount, 500);
    assert.equal(plans.get("other").targets[0].amount, 1);
});

test("plan updates reject foreign ownership fields, duplicate names, invalid amounts and untrusted origins", async () => {
    for (const body of [
        { userId: "other", targets: [] }, { targets: [], referenceIncome: 34800 },
        { targets: [{ name: "Food", amount: 5 }, { name: " food ", amount: 6 }] },
        { targets: [{ name: "Food", amount: -1 }] },
    ]) assert.equal((await request("PUT", body)).status, 400);
    assert.equal((await request("PUT", { targets: [] }, { Origin: "https://untrusted.invalid", "Content-Type": "application/json" })).status, 403);
    assert.equal(calls.length, 0);
    assert.equal(plans.size, 0);
});

test("plan add/edit/remove persists through reload without deleting categories or changing reference income", async () => {
    plans.set("owner", { userId: "owner", targets: [], referenceIncome: new Decimal(34800), updatedAt: new Date() });
    await request("PUT", { targets: [{ name: "Food", amount: 100 }, { name: "Custom target", amount: 200 }] });
    assert.equal((await request("GET")).body.plan.targets.length, 2);
    await request("PUT", { targets: [{ name: "Food", amount: 300 }] });
    const read = (await request("GET")).body;
    assert.equal(read.plan.targets[0].amount, 300);
    assert.equal(read.plan.referenceIncome, 34800);
    assert.equal(categories.length, 2);
    assert.equal(read.snapshots[0].total, 10);
});
