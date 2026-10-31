import "./helpers/transfer-fixtures.mjs";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { contracts, fixture, resign } from "./helpers/transfer-fixtures.mjs";

test("local MySQL transfer preserves precision, skips reruns, rolls back failures and leaves all real data unchanged", {
    skip: process.env.LIFEOS_TEST_MYSQL_DATA_TRANSFER !== "1",
    timeout: 90_000,
}, async () => {
    const url = new URL(process.env.DATABASE_URL);
    assert.notEqual(process.env.NODE_ENV, "production");
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
    assert.equal(url.pathname, "/lifeos");
    process.env.DEBUG = "";
    const { PrismaClient } = await import("../src/generated/prisma/client.ts");
    const { PrismaMariaDb } = await import("@prisma/adapter-mariadb");
    const { databaseAdapterOptions } = await import("../src/lib/server/database-config.ts");
    const { verifySchema, readApprovedRecords, importInTransaction } = await import("../src/lib/server/data-transfer/database.ts");
    const client = new PrismaClient({ adapter: new PrismaMariaDb(databaseAdapterOptions()) });
    const fixtureId = `transfer-test-${randomUUID()}`;
    const email = `${fixtureId}@example.invalid`;
    const { pkg, policy } = fixture();
    pkg.manifest.source.email = email;
    contracts.validatePackage(resign(pkg), policy);
    const rollback = new Error("INTENTIONAL_FIXTURE_ROLLBACK");
    const approvedModels = contracts.models;
    const protectedModels = ["user", "account", "session", "rateLimit", "bankAccount", "financeTransaction", "investment", "liability", "financialPositionSnapshot"];
    const counts = async () => Object.fromEntries(await Promise.all([...approvedModels, ...protectedModels].map(async (name) => [name, await client[name].count()])));
    try {
        const baseline = await counts();
        // Read and hash the approved source fields only; never print Health values.
        const sourceId = process.env.LIFEOS_TRANSFER_TEST_SOURCE_OWNER_ID;
        assert.ok(sourceId, "Set the explicit approved local source owner ID for this opt-in test.");
        assert.ok(await client.user.findUnique({ where: { id: sourceId }, select: { id: true } }));
        const beforeSource = contracts.sha256(contracts.canonical(await readApprovedRecords(client, sourceId)));
        await assert.rejects(client.$transaction(async (tx) => {
            await verifySchema(tx, "lifeos");
            await tx.user.create({ data: { id: fixtureId, name: "Transfer rollback-only fixture", email } });
            const dry = await importInTransaction(tx, pkg, fixtureId, email, true);
            assert.equal(dry.counts.healthLog.create, 17);
            for (const model of approvedModels) {
                assert.equal(await tx[model].count({ where: { userId: fixtureId } }), 0);
            }
            const applied = await importInTransaction(tx, pkg, fixtureId, email, false);
            assert.equal(applied.applied, true);
            const records = await readApprovedRecords(tx, fixtureId);
            assert.equal(records.healthLog.length, 17);
            const first = records.healthLog.find(row => row.date === "2026-10-13");
            assert.equal(first.proteinGrams, "90.01");
            assert.equal(first.carbsGrams, null);
            assert.equal(first.createdAt, pkg.records.healthLog[0].createdAt);
            assert.equal(records.healthTargets[0].updatedAt, pkg.records.healthTargets[0].updatedAt);
            const repeat = await importInTransaction(tx, pkg, fixtureId, email, false);
            assert.ok(approvedModels.every(model => repeat.counts[model].create === 0));
            const changed = structuredClone(pkg);
            changed.records.healthLog[0].steps++;
            const conflict = await importInTransaction(tx, resign(changed), fixtureId, email, true);
            assert.equal(conflict.counts.healthLog.conflict, 1);
            await assert.rejects(importInTransaction(tx, changed, fixtureId, email, false), /UNRESOLVED_CONFLICTS/);
            assert.equal(await tx.healthLog.count({ where: { userId: fixtureId } }), 17);
            assert.equal(await tx.financeTransaction.count({ where: { userId: fixtureId } }), 0);
            assert.equal(await tx.bankAccount.count({ where: { userId: fixtureId } }), 0);
            throw rollback;
        }, { isolationLevel: "Serializable", timeout: 40_000 }), error => error === rollback);
        assert.equal(await client.user.findUnique({ where: { id: fixtureId } }), null);
        assert.deepEqual(await counts(), baseline);
        // Real earlier inserts must also roll back when a later approved-model write fails.
        await assert.rejects(client.$transaction(async (tx) => {
            await tx.user.create({ data: { id: fixtureId, name: "Transfer rollback-only fixture", email } });
            const failed = new Proxy(tx, {
                get(target, property) {
                    if (property === "expenseCategory") return {
                        ...target.expenseCategory,
                        create() { throw new Error("INJECTED_TRANSFER_WRITE_FAILURE"); },
                    };
                    return Reflect.get(target, property);
                },
            });
            await importInTransaction(failed, pkg, fixtureId, email, false);
        }, { isolationLevel: "Serializable", timeout: 40_000 }), /INJECTED_TRANSFER_WRITE_FAILURE/);
        assert.deepEqual(await counts(), baseline);
        assert.equal(contracts.sha256(contracts.canonical(await readApprovedRecords(client, sourceId))), beforeSource);
    } finally {
        // No deletes, updates, migrations, or committed fixture creation.
        await client.$disconnect();
    }
});
