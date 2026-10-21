import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createFinanceMutation } from "../src/features/finance/utils/finance-mutation.ts";

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((fulfill, fail) => {
        resolve = fulfill;
        reject = fail;
    });
    return { promise, resolve, reject };
}

function dialog() {
    const state = {
        open: true,
        values: { description: "Entered value", amount: 125 },
        successes: 0,
        error: null,
        pending: [],
    };
    const mutation = createFinanceMutation((pending) => state.pending.push(pending));
    const feedback = {
        onSuccess() {
            state.successes++;
            state.open = false;
        },
        onError(cause) {
            state.error = cause;
        },
    };
    return { state, mutation, feedback };
}

test("awaits confirmed success before notifying and closing", async () => {
    const { state, mutation, feedback } = dialog();
    const operation = deferred();
    const result = mutation.run(() => operation.promise, feedback);
    assert.equal(mutation.isPending(), true);
    assert.equal(state.open, true);
    assert.equal(state.successes, 0);
    operation.resolve(true);
    assert.equal(await result, true);
    assert.equal(state.open, false);
    assert.equal(state.successes, 1);
    assert.equal(mutation.isPending(), false);
    assert.deepEqual(state.pending, [true, false]);
});

test("false completion keeps the dialog and entered values without success feedback", async () => {
    const { state, mutation, feedback } = dialog();
    const values = { ...state.values };
    const operation = deferred();
    const result = mutation.run(() => operation.promise, feedback);
    operation.resolve(false);
    assert.equal(await result, false);
    assert.equal(state.open, true);
    assert.deepEqual(state.values, values);
    assert.equal(state.successes, 0);
    assert.equal(state.error, null);
    assert.equal(mutation.isPending(), false);
});

test("rejected submissions retain values, expose the error, and permit retry", async () => {
    const { state, mutation, feedback } = dialog();
    const values = { ...state.values };
    const cause = new Error("Insufficient balance");
    const operation = deferred();
    const result = mutation.run(() => operation.promise, feedback);
    operation.reject(cause);
    assert.equal(await result, false);
    assert.equal(state.error, cause);
    assert.equal(state.open, true);
    assert.deepEqual(state.values, values);
    assert.equal(state.successes, 0);
    assert.equal(mutation.isPending(), false);
    assert.equal(await mutation.run(async () => true, feedback), true);
    assert.equal(state.successes, 1);
});

test("blocks duplicate submissions synchronously until the first settles", async () => {
    const { state, mutation, feedback } = dialog();
    const operation = deferred();
    let calls = 0;
    const submit = () => {
        calls++;
        return operation.promise;
    };
    const first = mutation.run(submit, feedback);
    assert.equal(await mutation.run(submit, feedback), false);
    assert.equal(calls, 1);
    assert.deepEqual(state.pending, [true]);
    operation.resolve(true);
    await first;
    assert.equal(state.successes, 1);
});

test("synchronous local operations complete before success feedback", async () => {
    const events = [];
    const mutation = createFinanceMutation((pending) => events.push(pending));
    assert.equal(await mutation.run(() => {
        events.push("saved locally");
        return true;
    }, {
        onSuccess: () => events.push("success and close"),
        onError: assert.fail,
    }), true);
    assert.deepEqual(events, [true, "saved locally", "success and close", false]);
});

test("synchronous store exceptions never trigger success and release the lock", async () => {
    const { state, mutation, feedback } = dialog();
    const cause = new Error("This account has transactions.");
    assert.equal(await mutation.run(() => { throw cause; }, feedback), false);
    assert.equal(state.error, cause);
    assert.equal(state.successes, 0);
    assert.equal(state.open, true);
    assert.equal(mutation.isPending(), false);
});
