import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { sameOriginHeaders } from "./helpers/mutation-request.mjs";
const { expenseCategoryRequestSchema } = await import("../src/features/finance/schemas/expense-category-schema.ts");
const { categoryNameKey, expenseCategoryLabels } = await import("../src/features/finance/utils/expense-categories.ts");
const { defaultExpenseAccount, pendingExpenseAccount } = await import("../src/features/finance/utils/expense-account.ts");
const { categorySpending } = await import("../src/features/finance/utils/finance-calculations.ts");
const { ensureExpenseCategory, readExpenseCategories } = await import("../src/features/finance/server/expense-categories.ts");
const { createFinanceStore, emptyFinanceData } = await import("../src/features/finance/store/finance-store-core.ts");

const state = {};
const key = "lifeos.expense-category-tests";
globalThis[Symbol.for(key)] = state;
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "@/lib/auth" || specifier === "@/lib/prisma") {
            const source = specifier.endsWith("auth")
                ? `export const auth = { api: { getSession: async () => globalThis[Symbol.for('${key}')].session } };`
                : `export const prisma = globalThis[Symbol.for('${key}')].client;`;
            return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        }
        if (specifier === "@/features/finance/server/expense-category-handler") {
            return nextResolve(new URL("../src/features/finance/server/expense-category-handler.ts", import.meta.url).href, context);
        }
        if (specifier === "next/server") return nextResolve("next/server.js", context);
        return nextResolve(specifier, context);
    },
});
const rows = [];
let calls = 0;
state.client = {
    expenseCategory: {
        async findUnique({ where: { userId_normalizedName: where } }) {
            calls++;
            return rows.find((row) => row.userId === where.userId && row.normalizedName === where.normalizedName) ?? null;
        },
        async create({ data }) {
            calls++;
            if (rows.some((row) => row.userId === data.userId && row.normalizedName === data.normalizedName)) {
                throw Object.assign(new Error("PRIVATE_SQL"), { code: "P2002" });
            }
            const row = { ...data, id: `category-${rows.length}`, createdAt: new Date() };
            rows.push(row);
            return row;
        },
        async findMany({ where }) {
            calls++;
            return rows.filter((row) => row.userId === where.userId);
        },
    },
    financeTransaction: {
        async findMany({ where, select }) {
            calls++;
            assert.equal(where.userId, "user-a");
            assert.equal(where.type, "expense");
            assert.deepEqual(select, { category: true });
            return [{ category: "Legacy Category" }];
        },
    },
};
const route = await import("../src/app/api/finance/categories/route.ts");
beforeEach(() => {
    rows.length = 0;
    calls = 0;
    state.session = { user: { id: "user-a" } };
});

function request(method, body, headers = sameOriginHeaders({ "Content-Type": "application/json" })) {
    return route[method](new Request("http://localhost/api/finance/categories?userId=user-b", {
        method, headers, ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    }));
}

test("categories normalize whitespace and capitalization while rejecting invalid names and ownership inputs", () => {
    assert.equal(expenseCategoryRequestSchema.parse({ name: "  Local   groceries  " }).name, "Local groceries");
    assert.equal(categoryNameKey(" GROCERIES "), categoryNameKey("groceries"));
    for (const body of [{ name: " " }, { name: "x".repeat(101) }, { name: "bad\u0000name" }, { name: 9 }, { name: "Food", userId: "foreign" }]) {
        assert.equal(expenseCategoryRequestSchema.safeParse(body).success, false);
    }
});

test("fallback account selection is deterministic and asynchronous data cannot overwrite user choices", () => {
    const accounts = [{ value: "oldest", label: "Everyday" }, { value: "second", label: "Savings" }];
    assert.equal(defaultExpenseAccount([]), "");
    assert.equal(defaultExpenseAccount(accounts), "oldest");
    assert.equal(pendingExpenseAccount("", false, accounts), "oldest");
    assert.equal(pendingExpenseAccount("second", true, accounts), "second");
    assert.equal(pendingExpenseAccount("second", false, accounts), "second");
    assert.equal(pendingExpenseAccount("", true, accounts), "");
});

test("category creation deduplicates names and competing creates, with separate ownership", async () => {
    const [first, second] = await Promise.all([
        ensureExpenseCategory(state.client, "user-a", " Groceries "),
        ensureExpenseCategory(state.client, "user-a", "groceries"),
    ]);
    assert.equal(first.id, second.id);
    assert.equal(rows.length, 1);
    const foreign = await ensureExpenseCategory(state.client, "user-b", "Groceries");
    assert.notEqual(foreign.id, first.id);
    assert.equal(rows.length, 2);
    const categories = await readExpenseCategories(state.client, "user-a");
    assert.ok(categories.some((item) => item.id === first.id));
    assert.ok(!categories.some((item) => item.id === foreign.id));
});

test("reads include all built-ins and historical labels without inserting or rewriting records", async () => {
    const response = await request("GET");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const { categories } = await response.json();
    for (const name of ["Food", "Shopping", "Transport", "Bills", "Health", "Entertainment", "Other", "Legacy Category"]) {
        assert.ok(categories.some((item) => item.name === name));
    }
    assert.equal(rows.length, 0);
});

test("GET and POST authenticate before database access; POST enforces origin and strict validation", async () => {
    state.session = null;
    assert.equal((await request("GET")).status, 401);
    assert.equal((await request("POST", { name: "Private" })).status, 401);
    assert.equal(calls, 0);
    state.session = { user: { id: "user-a" } };
    assert.equal((await request("POST", { name: "Food" }, { Origin: "https://evil.invalid" })).status, 403);
    assert.equal((await request("POST", { name: "" })).status, 400);
    assert.equal((await request("POST", { name: "Food", userId: "user-b" })).status, 400);
    assert.equal(calls, 0);
    const result = await request("POST", { name: " groceries " });
    assert.equal(result.status, 200);
    assert.equal(rows[0].userId, "user-a");
});

test("unexpected database failures remain generic and do not expose native diagnostics", async (t) => {
    t.mock.method(state.client.expenseCategory, "findUnique", async () => { throw new Error("PRIVATE_SQL"); });
    const messages = [];
    t.mock.method(console, "error", (...input) => messages.push(input));
    const response = await request("POST", { name: "Groceries" });
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error, "INTERNAL_SERVER_ERROR");
    assert.ok(!JSON.stringify(messages).includes("PRIVATE_SQL"));
});

test("new category survives subsequent form loads, fresh store instances and session changes", async () => {
    const api = {
        async getFinanceData() { return emptyFinanceData(); },
        async getCategories() { return readExpenseCategories(state.client, "user-a"); },
        async createCategory({ name }) {
            const row = await ensureExpenseCategory(state.client, "user-a", name);
            return { id: row.id, name: row.name, builtIn: false };
        },
    };
    const store = createFinanceStore(api);
    await store.setSession("user-a");
    await store.actions.loadCategories();
    const saved = await store.actions.createCategory("Groceries");
    await store.actions.loadCategories();
    assert.ok(store.getSnapshot().categories.some((category) => category.id === saved.id));
    const fresh = createFinanceStore(api);
    await fresh.setSession("user-a");
    await fresh.actions.loadCategories();
    assert.ok(fresh.getSnapshot().categories.some((category) => category.id === saved.id));
    await fresh.setSession(null);
    assert.deepEqual(fresh.getSnapshot().categories, []);
});

test("custom category filters and reports accept open-ended names while retaining legacy labels", () => {
    const transactions = [{ type: "expense", amount: 50, category: "Groceries", date: "2026-10-20" }];
    assert.ok(expenseCategoryLabels(transactions.map((item) => item.category)).includes("Groceries"));
    assert.ok(expenseCategoryLabels([" food "]).includes(" food "));
    assert.deepEqual(categorySpending(transactions, "2026-10"), [{ category: "Groceries", amount: 50 }]);
});

test("category migration is additive and enforces ownership without changing historical text", () => {
    const sql = readFileSync(new URL("../prisma/migrations/20261028000000_expense_categories/migration.sql", import.meta.url), "utf8");
    assert.match(sql, /CREATE TABLE `expense_categories`/);
    assert.match(sql, /ADD COLUMN `categoryId` VARCHAR\(191\) NULL/);
    assert.match(sql, /FOREIGN KEY \(`categoryId`, `userId`\)/);
    assert.match(sql, /UNIQUE INDEX[^\n]*`userId`, `normalizedName`/);
    assert.match(sql, /COLLATE utf8mb4_bin/);
    assert.doesNotMatch(sql, /^\s*(DROP|TRUNCATE|UPDATE|INSERT|DELETE FROM)\b/im);
});
