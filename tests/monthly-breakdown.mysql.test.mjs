import "./helpers/register-typescript.mjs";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

test("local MySQL imports idempotently and persists user-owned editable plans without ledger writes", {
    skip: process.env.LIFEOS_TEST_MYSQL_MONTHLY_BREAKDOWN !== "1",
    timeout: 60_000,
}, async () => {
    const url = new URL(process.env.DATABASE_URL);
    assert.notEqual(process.env.NODE_ENV, "production");
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
    assert.equal(url.pathname, "/lifeos");
    const { PrismaClient } = await import("../src/generated/prisma/client.ts");
    const { databaseAdapterOptions } = await import("../src/lib/server/database-config.ts");
    const { importMonthlyHistory, readHistoricalSource } = await import("../src/features/finance/monthly/server/historical-import.ts");
    const { readMonthlyBreakdown, saveSpendingPlan } = await import("../src/features/finance/monthly/server/service.ts");
    const clients = [0, 1].map(() => new PrismaClient({ adapter: new PrismaMariaDb(databaseAdapterOptions()) }));
    const owners = [randomUUID(), randomUUID()];
    try {
        for (const id of owners) await clients[0].user.create({ data: { id, name: "Monthly test fixture", email: `${id}@example.invalid` } });
        const dry = await importMonthlyHistory(clients[0], owners[0], { dryRun: true, part: "all" });
        assert.deepEqual(dry, { create: 11, update: 0, unchanged: 0, plan: "create", validatedRows: 12 });
        assert.deepEqual(await readMonthlyBreakdown(clients[1], owners[0]), { snapshots: [], plan: null });
        const historyOnly = await importMonthlyHistory(clients[0], owners[0], { dryRun: false, part: "history" });
        assert.equal(historyOnly.create, 11);
        assert.equal((await readMonthlyBreakdown(clients[1], owners[0])).plan, null);
        await importMonthlyHistory(clients[0], owners[0], { dryRun: false, part: "plan" });
        const imported = await readMonthlyBreakdown(clients[1], owners[0]);
        assert.deepEqual(imported.snapshots, readHistoricalSource().history);
        assert.equal(imported.plan.referenceIncome, 34800);
        assert.equal(imported.plan.targets.length, 15);
        const repeated = await importMonthlyHistory(clients[0], owners[0], { dryRun: false, part: "all" });
        assert.deepEqual(repeated, { create: 0, update: 0, unchanged: 11, plan: "preserve saved plan", validatedRows: 12 });
        assert.deepEqual(await readMonthlyBreakdown(clients[1], owners[1]), { snapshots: [], plan: null });
        const edited = await saveSpendingPlan(clients[0], owners[0], { targets: [{ name: "Food", amount: 1250.25 }, { name: "New monthly target", amount: 400 }] });
        assert.equal(edited.targets.length, 2);
        assert.equal(edited.referenceIncome, 34800);
        assert.deepEqual((await readMonthlyBreakdown(clients[1], owners[0])).plan.targets, edited.targets);
        await importMonthlyHistory(clients[0], owners[0], { dryRun: false, part: "all" });
        assert.deepEqual((await readMonthlyBreakdown(clients[1], owners[0])).plan.targets, edited.targets, "Reruns never replace edited targets");
        await saveSpendingPlan(clients[0], owners[0], { targets: [] });
        const cleared = await readMonthlyBreakdown(clients[1], owners[0]);
        assert.deepEqual(cleared.plan.targets, []);
        assert.deepEqual(cleared.snapshots, imported.snapshots);
        assert.equal(await clients[0].expenseCategory.count({ where: { userId: owners[0], name: "New monthly target" } }), 1, "Removing a target retains its category");
        await saveSpendingPlan(clients[0], owners[1], { targets: [{ name: "Food", amount: 999 }] });
        assert.deepEqual((await readMonthlyBreakdown(clients[1], owners[0])).plan.targets, []);
        assert.equal((await readMonthlyBreakdown(clients[1], owners[1])).plan.referenceIncome, null, "Unimported owners have no fabricated income reference");
        for (const owner of owners) {
            assert.equal(await clients[0].financeTransaction.count({ where: { userId: owner } }), 0);
            assert.equal(await clients[0].bankAccount.count({ where: { userId: owner } }), 0);
            assert.equal(await clients[0].financialPositionSnapshot.count({ where: { userId: owner } }), 0);
        }
        await assert.rejects(importMonthlyHistory(clients[0], "missing-owner", { dryRun: true, part: "all" }));
    } finally {
        // Only synthetic owners created above. Existing user data is never deleted.
        await clients[0].user.deleteMany({ where: { id: { in: owners } } });
        await Promise.all(clients.map((client) => client.$disconnect()));
    }
});
