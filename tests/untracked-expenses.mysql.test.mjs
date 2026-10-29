import "./helpers/register-typescript.mjs";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

// Explicitly opt in only after applying the migration to the local development DB.
test("local MySQL persists Untracked expenses and atomically recalculates tracking changes", {
    skip: process.env.LIFEOS_TEST_MYSQL_UNTRACKED_EXPENSES !== "1",
    timeout: 60_000,
}, async () => {
    const target = new URL(process.env.DATABASE_URL);
    assert.notEqual(process.env.NODE_ENV, "production");
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname));
    assert.equal(target.pathname, "/lifeos");
    const { PrismaClient } = await import("../src/generated/prisma/client.ts");
    const { databaseAdapterOptions } = await import("../src/lib/server/database-config.ts");
    const { mutateTransaction } = await import("../src/features/finance/server/transaction-mutations.ts");
    const { calculateFinancialPosition } = await import("../src/features/finance/server/finance-position.ts");
    const { toFinanceTransactionDto } = await import("../src/features/finance/server/finance-dto.ts");
    const clients = [0, 1].map(() => new PrismaClient({ adapter: new PrismaMariaDb(databaseAdapterOptions()) }));
    const users = [randomUUID(), randomUUID()];
    try {
        const database = await clients[0].$queryRawUnsafe("SELECT DATABASE() AS name");
        assert.equal(database[0].name, "lifeos");
        for (const id of users) {
            await clients[0].user.create({ data: { id, name: "Untracked integration test", email: `${id}@example.invalid` } });
        }
        const accounts = await Promise.all(users.map((userId) => clients[0].bankAccount.create({ data: {
            userId, name: "Integration account", balanceSnapshot: "1000", balanceSnapshotAt: new Date("2020-01-01"),
        } })));
        const draft = { type: "expense", amount: 800, description: "Test gym", date: "2026-10-01", category: "Health", isUntracked: true };
        const saved = await mutateTransaction(clients[0], users[0], { kind: "create", input: draft });
        const id = saved.transaction.id;
        const reread = toFinanceTransactionDto(await clients[1].financeTransaction.findFirstOrThrow({ where: { id, userId: users[0] } }));
        assert.equal(reread.isUntracked, true);
        assert.equal(reread.accountId, undefined);
        const bankValue = async () => {
            const records = {
                accounts: await clients[1].bankAccount.findMany({ where: { userId: users[0] } }),
                investments: [], liabilities: [],
                transactions: await clients[1].financeTransaction.findMany({ where: { userId: users[0] } }),
            };
            const value = calculateFinancialPosition(records).bank.toString();
            const snapshot = await clients[1].financialPositionSnapshot.findFirstOrThrow({
                where: { userId: users[0] }, orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
            });
            assert.equal(snapshot.bank.toString(), value);
            return value;
        };
        assert.equal(await bankValue(), "1000");
        await mutateTransaction(clients[0], users[0], { kind: "update", id, input: { ...draft, amount: 1200, category: "Gym allocation", description: "Test merchant", date: "2026-10-02", note: "Monthly allocation" } });
        assert.equal(await bankValue(), "1000");
        const tracked = { ...draft, isUntracked: false, accountId: accounts[0].id, amount: 100 };
        await mutateTransaction(clients[0], users[0], { kind: "update", id, input: tracked });
        assert.equal(await bankValue(), "900");
        await assert.rejects(mutateTransaction(clients[0], users[0], {
            kind: "update", id, input: { ...tracked, accountId: accounts[1].id },
        }), { code: "INVALID_ACCOUNT" });
        await assert.rejects(mutateTransaction(clients[0], users[1], { kind: "delete", id }), { code: "NOT_FOUND" });
        assert.equal(await bankValue(), "900");
        await mutateTransaction(clients[0], users[0], { kind: "update", id, input: draft });
        assert.equal(await bankValue(), "1000");
        await mutateTransaction(clients[0], users[0], { kind: "delete", id });
        assert.equal(await bankValue(), "1000");
        assert.equal(await clients[1].financeTransaction.count({ where: { id } }), 0);
        const otherOwner = await mutateTransaction(clients[0], users[1], { kind: "create", input: draft });
        assert.equal(otherOwner.transaction.isUntracked, true);
    } finally {
        // Only fixture owners/records created by this test; never existing records.
        await clients[0].financeTransaction.deleteMany({ where: { userId: { in: users } } });
        await clients[0].user.deleteMany({ where: { id: { in: users } } });
        await Promise.all(clients.map((client) => client.$disconnect()));
    }
});
