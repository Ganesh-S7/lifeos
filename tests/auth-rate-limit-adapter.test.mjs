import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { rateLimitSafeAdapter } = await import("../src/lib/server/auth-rate-limit-adapter.ts");
const request = {
    model: "rateLimit",
    where: [
        { field: "key", value: "synthetic|/sign-in/email" },
        { field: "lastRequest", operator: "gt", value: 1_000 },
        { field: "count", operator: "lt", value: 3 },
    ],
    increment: { count: 1 },
    set: { lastRequest: 61_000 },
};

function fixture(affected = 1) {
    const calls = [];
    const client = {
        rateLimit: {
            async updateMany(args) {
                calls.push(args);
                return { count: affected };
            },
            async findUniqueOrThrow() {
                calls.push("read");
                return { id: "synthetic", key: request.where[0].value, count: 3, lastRequest: 61_000n };
            },
        },
    };
    const adapter = rateLimitSafeAdapter(() => ({
        incrementOne: async () => "unrelated adapter operation",
    }), client)({});
    return { adapter, client, calls };
}

test("rate-limit consume uses one guarded update and affected rows, never a stale read", async () => {
    const { adapter, calls } = fixture(0);
    assert.equal(await adapter.incrementOne(request), null);
    assert.deepEqual(calls, [{
        where: { AND: [
            { key: "synthetic|/sign-in/email" },
            { lastRequest: { gt: 1_000 } },
            { count: { lt: 3 } },
        ] },
        data: { count: { increment: 1 }, lastRequest: 61_000n },
    }]);
});

test("successful consumes return the native numeric timestamp representation", async () => {
    const { adapter } = fixture();
    const row = await adapter.incrementOne(request);
    assert.equal(row.lastRequest, 61_000);
    assert.equal(row.count, 3);
});

test("expired-window reset keeps the native compare-and-set timestamp guard", async () => {
    const { adapter, calls } = fixture();
    await adapter.incrementOne({
        ...request,
        where: [request.where[0], { field: "lastRequest", operator: "lte", value: 1_000 }],
        increment: {},
        set: { count: 1, lastRequest: 61_000 },
    });
    assert.deepEqual(calls[0], {
        where: { AND: [{ key: "synthetic|/sign-in/email" }, { lastRequest: { lte: 1_000 } }] },
        data: { count: 1, lastRequest: 61_000n },
    });
});

test("unrelated adapter operations are preserved and unsupported predicates fail closed", async () => {
    const { adapter, calls } = fixture();
    assert.equal(await adapter.incrementOne({ ...request, model: "user" }), "unrelated adapter operation");
    await assert.rejects(adapter.incrementOne({
        ...request, where: [{ field: "key", value: "synthetic", connector: "OR" }],
    }), /Unsupported rate-limit/);
    assert.deepEqual(calls, []);
});

test("database failures propagate instead of admitting an uncounted request", async () => {
    const { adapter, client } = fixture();
    const failure = new Error("Synthetic database failure");
    client.rateLimit.updateMany = async () => { throw failure; };
    await assert.rejects(adapter.incrementOne(request), (error) => error === failure);
});
