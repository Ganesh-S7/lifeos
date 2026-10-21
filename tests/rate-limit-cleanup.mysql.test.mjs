import "./helpers/register-typescript.mjs";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const { cleanupRateLimits, RATE_LIMIT_RETENTION_MS } = await import("../src/lib/server/rate-limit-cleanup.ts");

test("local MySQL cleanup rechecks refreshed rows and tolerates overlapping invocations", {
    skip: process.env.LIFEOS_TEST_MYSQL_CLEANUP !== "1",
    timeout: 60_000,
}, async () => {
    const target = new URL(process.env.DATABASE_URL);
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname),
        "Real cleanup tests require loopback MySQL");
    const { PrismaClient } = await import("../src/generated/prisma/client.ts");
    const { databaseAdapterOptions } = await import("../src/lib/server/database-config.ts");
    const clients = Array.from({ length: 2 }, () => new PrismaClient({
        adapter: new PrismaMariaDb(databaseAdapterOptions()),
    }));
    const prefix = `task25-${randomUUID()}`;
    const now = Date.now();
    const cutoff = BigInt(now - RATE_LIMIT_RETENTION_MS);
    const refreshedId = `${prefix}-refreshed`;
    let refresh = true;
    // The only test-specific extra predicate restricts every real SQL query to
    // disposable fixture keys. Existing local records cannot be selected/deleted.
    function scoped(client) {
        return {
            rateLimit: {
                async findMany(args) {
                    const result = await client.rateLimit.findMany({
                        ...args,
                        where: { AND: [args.where, { key: { startsWith: prefix } }] },
                    });
                    if (refresh && result.some((row) => row.id === refreshedId)) {
                        refresh = false;
                        // A separate pool commits an update after the real SELECT
                        // and before the helper issues its guarded DELETE.
                        await clients[1].rateLimit.update({
                            where: { id: refreshedId },
                            data: { lastRequest: BigInt(now) },
                        });
                    }
                    return result;
                },
                deleteMany(args) {
                    return client.rateLimit.deleteMany({
                        ...args,
                        where: { AND: [args.where, { key: { startsWith: prefix } }] },
                    });
                },
            },
        };
    }
    try {
        assert.equal(await clients[0].rateLimit.count({ where: { key: { startsWith: prefix } } }), 0);
        await clients[0].rateLimit.createMany({ data: [
            { id: `${prefix}-stale`, key: `${prefix}|stale`, count: 3, lastRequest: cutoff - 1n },
            { id: refreshedId, key: `${prefix}|refreshed`, count: 3, lastRequest: cutoff - 1n },
            { id: `${prefix}-boundary`, key: `${prefix}|boundary`, count: 3, lastRequest: cutoff },
            { id: `${prefix}-recent`, key: `${prefix}|recent`, count: 3, lastRequest: BigInt(now) },
        ] });
        assert.deepEqual(await cleanupRateLimits(scoped(clients[0]), now), {
            deleted: 1, batches: 1, limitReached: false,
        });
        assert.equal(await clients[0].rateLimit.count({ where: { key: { startsWith: prefix } } }), 3);
        assert.equal((await clients[0].rateLimit.findUniqueOrThrow({ where: { id: refreshedId } })).lastRequest,
            BigInt(now));
        await clients[0].rateLimit.createMany({ data: Array.from({ length: 12 }, (_, index) => ({
            id: `${prefix}-parallel-${index}`,
            key: `${prefix}|parallel-${index}`,
            count: 3,
            lastRequest: cutoff - 1n,
        })) });
        const results = await Promise.all(clients.map((client) => cleanupRateLimits(scoped(client), now)));
        assert.equal(results.reduce((sum, result) => sum + result.deleted, 0), 12);
        assert.deepEqual(await cleanupRateLimits(scoped(clients[0]), now), {
            deleted: 0, batches: 0, limitReached: false,
        });
        assert.equal(await clients[0].rateLimit.count({ where: { key: { startsWith: prefix } } }), 3);
    } finally {
        try {
            await clients[0].rateLimit.deleteMany({ where: { key: { startsWith: prefix } } });
            assert.equal(await clients[0].rateLimit.count({ where: { key: { startsWith: prefix } } }), 0);
        } finally {
            await Promise.all(clients.map((client) => client.$disconnect()));
        }
    }
});
