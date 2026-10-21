import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const {
    cleanupRateLimits,
    RATE_LIMIT_RETENTION_MS,
    RATE_LIMIT_CLEANUP_BATCH_SIZE,
    RATE_LIMIT_CLEANUP_MAX_BATCHES,
} = await import("../src/lib/server/rate-limit-cleanup.ts");
const { authOptions } = await import("../src/lib/server/auth-config.ts");
const now = Date.UTC(2026, 9, 21, 12);
const cutoff = BigInt(now - RATE_LIMIT_RETENTION_MS);

function fixture(rows, beforeDelete) {
    const records = new Map(rows.map((row) => [row.id, { ...row }]));
    const selections = [];
    const deletions = [];
    return {
        records, selections, deletions,
        client: {
            rateLimit: {
                async findMany(args) {
                    selections.push(args);
                    return [...records.values()]
                        .filter((row) => row.lastRequest < args.where.lastRequest.lt)
                        .sort((a, b) => a.lastRequest === b.lastRequest
                            ? a.id.localeCompare(b.id)
                            : a.lastRequest < b.lastRequest ? -1 : 1)
                        .slice(0, args.take)
                        .map(({ id }) => ({ id }));
                },
                async deleteMany(args) {
                    deletions.push(args);
                    await beforeDelete?.(records, deletions.length);
                    let count = 0;
                    for (const id of args.where.id.in) {
                        const record = records.get(id);
                        if (record && record.lastRequest < args.where.lastRequest.lt) {
                            records.delete(id);
                            count++;
                        }
                    }
                    return { count };
                },
            },
        },
    };
}

function staleRows(count) {
    return Array.from({ length: count }, (_, index) => ({
        id: `synthetic-${String(index).padStart(5, "0")}`,
        lastRequest: cutoff - 1n,
    }));
}

test("seven-day retention safely exceeds every configured window; daily cron is registered", () => {
    const options = authOptions({
        NODE_ENV: "production",
        BETTER_AUTH_URL: "https://cleanup-test.example.invalid",
        BETTER_AUTH_SECRET: "Synthetic-Only-Secret-For-Cleanup-Test-0123456789",
    });
    const windows = [options.rateLimit.window, ...Object.values(options.rateLimit.customRules).map((rule) => rule.window)];
    assert.equal(Math.max(...windows), 300);
    assert.equal(RATE_LIMIT_RETENTION_MS, 7 * 24 * 60 * 60 * 1000);
    assert.ok(RATE_LIMIT_RETENTION_MS > Math.max(...windows) * 1000);
    const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
    assert.ok(config.crons.some((cron) => cron.path === "/api/cron/cleanup-rate-limits" && cron.schedule === "0 4 * * *"));
});

test("stale rows are removed, recent/boundary/future timestamps preserved, repeated cleanup is empty", async () => {
    const state = fixture([
        { id: "stale", lastRequest: cutoff - 1n },
        { id: "boundary", lastRequest: cutoff },
        { id: "recent", lastRequest: BigInt(now) },
        { id: "future", lastRequest: BigInt(now + 1000) },
    ]);
    assert.deepEqual(await cleanupRateLimits(state.client, now), {
        deleted: 1, batches: 1, limitReached: false,
    });
    assert.deepEqual([...state.records.keys()], ["boundary", "recent", "future"]);
    assert.deepEqual(await cleanupRateLimits(state.client, now), {
        deleted: 0, batches: 0, limitReached: false,
    });
    assert.deepEqual(state.selections[0], {
        where: { lastRequest: { lt: cutoff } },
        orderBy: [{ lastRequest: "asc" }, { id: "asc" }],
        take: 500,
        select: { id: true },
    });
    assert.deepEqual(state.deletions[0].where, {
        id: { in: ["stale"] }, lastRequest: { lt: cutoff },
    });
});

test("a concurrently refreshed candidate is protected by the deletion predicate", async () => {
    const state = fixture([
        { id: "refreshed", lastRequest: cutoff - 1n },
        { id: "stale", lastRequest: cutoff - 1n },
    ], (records) => {
        records.get("refreshed").lastRequest = BigInt(now);
    });
    const result = await cleanupRateLimits(state.client, now);
    assert.equal(result.deleted, 1);
    assert.equal(state.records.has("refreshed"), true);
});

test("at most 500 candidates per batch and ten batches per run; next run continues", async () => {
    const state = fixture(staleRows(5100));
    assert.equal(RATE_LIMIT_CLEANUP_BATCH_SIZE, 500);
    assert.equal(RATE_LIMIT_CLEANUP_MAX_BATCHES, 10);
    assert.deepEqual(await cleanupRateLimits(state.client, now), {
        deleted: 5000, batches: 10, limitReached: true,
    });
    assert.equal(state.selections.length, 10);
    assert.ok(state.selections.every((query) => query.take === 500));
    assert.ok(state.deletions.every((query) => query.where.id.in.length <= 500));
    assert.deepEqual(await cleanupRateLimits(state.client, now), {
        deleted: 100, batches: 1, limitReached: false,
    });
});

test("partial failure preserves completed progress and performs no automatic retry", async () => {
    let fail = true;
    const state = fixture(staleRows(600), (_, batch) => {
        if (batch === 2 && fail) {
            throw new Error("Synthetic database unavailable");
        }
    });
    await assert.rejects(cleanupRateLimits(state.client, now), /Synthetic database unavailable/);
    assert.equal(state.deletions.length, 2);
    assert.equal(state.records.size, 100);
    fail = false;
    assert.equal((await cleanupRateLimits(state.client, now)).deleted, 100);
});

test("invalid reference times fail before touching storage", async () => {
    const state = fixture([]);
    for (const invalid of [NaN, Infinity, -1, 1.5]) {
        await assert.rejects(cleanupRateLimits(state.client, invalid), /Invalid cleanup reference time/);
    }
    assert.equal(state.selections.length, 0);
});
