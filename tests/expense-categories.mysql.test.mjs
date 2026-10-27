import "./helpers/register-typescript.mjs";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

// Requires the additive migration on a disposable local database. Never migrates or uses a hosted DB.
test("local MySQL persists categories across clients, deduplicates races and enforces category ownership", {
    skip: process.env.LIFEOS_TEST_MYSQL_EXPENSE_CATEGORIES !== "1",
    timeout: 60_000,
}, async () => {
    const target = new URL(process.env.DATABASE_URL);
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname), "Use an isolated loopback MySQL database");
    const { PrismaClient } = await import("../src/generated/prisma/client.ts");
    const { databaseAdapterOptions } = await import("../src/lib/server/database-config.ts");
    const { ensureExpenseCategory, readExpenseCategories } = await import("../src/features/finance/server/expense-categories.ts");
    const clients = [0, 1].map(() => new PrismaClient({ adapter: new PrismaMariaDb(databaseAdapterOptions()) }));
    const users = [randomUUID(), randomUUID()];
    try {
        for (const id of users) {
            await clients[0].user.create({ data: { id, name: "Category test", email: `${id}@example.invalid` } });
        }
        const [a, b] = await Promise.all([
            ensureExpenseCategory(clients[0], users[0], " Groceries "),
            ensureExpenseCategory(clients[1], users[0], "groceries"),
        ]);
        assert.equal(a.id, b.id);
        assert.equal(await clients[1].expenseCategory.count({ where: { userId: users[0] } }), 1);
        assert.ok((await readExpenseCategories(clients[1], users[0])).some((category) => category.id === a.id));
        const other = await ensureExpenseCategory(clients[1], users[1], "Groceries");
        assert.notEqual(other.id, a.id);
        assert.ok(!(await readExpenseCategories(clients[0], users[0])).some((category) => category.id === other.id));
        const bank = await clients[0].bankAccount.create({ data: {
            userId: users[0], name: "Test account", balanceSnapshot: "100", balanceSnapshotAt: new Date(),
        } });
        await assert.rejects(clients[0].financeTransaction.create({ data: {
            userId: users[0], type: "expense", accountId: bank.id, categoryId: other.id,
            category: "Groceries", amount: "1", description: "Test shop", date: new Date("2026-10-01T00:00:00Z"),
        } }), (error) => error.code === "P2003");
    } finally {
        // Delete only the synthetic owners created by this test, in FK-safe order.
        await clients[0].financeTransaction.deleteMany({ where: { userId: { in: users } } });
        await clients[0].user.deleteMany({ where: { id: { in: users } } });
        await Promise.all(clients.map((client) => client.$disconnect()));
    }
});
