import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { registerHooks } from "node:module";

const key = "lifeos.cleanup-route-tests";
const state = { finds: 0, deletes: 0, fail: false };
state.client = {
    rateLimit: {
        async findMany() {
            state.finds++;
            if (state.fail) {
                throw new Error("SYNTHETIC_DB_SECRET mysql://synthetic:password@invalid/db");
            }
            return [{ id: "synthetic-stale" }];
        },
        async deleteMany() {
            state.deletes++;
            return { count: 1 };
        },
    },
};
globalThis[Symbol.for(key)] = state;
const routeUrl = new URL("../src/app/api/cron/cleanup-rate-limits/route.ts", import.meta.url).href;
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "next/server") {
            return nextResolve("next/server.js", context);
        }
        if (context.parentURL === routeUrl && specifier === "@/lib/prisma") {
            const source = `export const prisma = globalThis[Symbol.for(${JSON.stringify(key)})].client;`;
            return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        }
        if (context.parentURL === routeUrl && specifier.startsWith("@/")) {
            return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
        }
        return nextResolve(specifier, context);
    },
});
const route = await import(routeUrl);
const originalSecret = process.env.CRON_SECRET;
const secret = "Synthetic-Cron-Secret-ONLY-0123456789";

beforeEach(() => {
    process.env.CRON_SECRET = secret;
    state.finds = 0;
    state.deletes = 0;
    state.fail = false;
});
afterEach(() => {
    if (originalSecret === undefined) {
        delete process.env.CRON_SECRET;
    } else {
        process.env.CRON_SECRET = originalSecret;
    }
});

function request(authorization) {
    return new Request("https://cleanup.example.invalid/api/cron/cleanup-rate-limits", {
        headers: authorization === undefined ? {} : { Authorization: authorization },
    });
}
function noStore(response) {
    assert.match(response.headers.get("Cache-Control"), /no-store/);
}

test("Node dynamic GET route requires the configured secret; missing never disables auth", async () => {
    assert.equal(route.runtime, "nodejs");
    assert.equal(route.dynamic, "force-dynamic");
    assert.equal(route.maxDuration, 60);
    for (const missing of [undefined, "", "   "]) {
        if (missing === undefined) {
            delete process.env.CRON_SECRET;
        } else {
            process.env.CRON_SECRET = missing;
        }
        const response = await route.GET(request("Bearer undefined"));
        assert.equal(response.status, 401);
        noStore(response);
    }
    assert.equal(state.finds, 0);
});

test("missing/wrong credentials and alternate authentication methods return 401 without queries", async () => {
    for (const value of [undefined, "", "Bearer wrong", "Basic synthetic", `bearer ${secret}`, secret]) {
        const response = await route.GET(request(value));
        assert.equal(response.status, 401);
        noStore(response);
        assert.equal((await response.text()).includes(secret), false);
    }
    const queryToken = new Request(`https://cleanup.example.invalid/api/cron/cleanup-rate-limits?secret=${secret}`);
    assert.equal((await route.GET(queryToken)).status, 401);
    assert.equal(state.finds, 0);
    assert.equal(state.deletes, 0);
});

test("correct bearer authorization runs cleanup without a session or Origin and returns only counts", async (t) => {
    const info = t.mock.method(console, "info", () => {});
    const response = await route.GET(request(`Bearer ${secret}`));
    assert.equal(response.status, 200);
    noStore(response);
    assert.deepEqual(await response.json(), { deleted: 1, batches: 1, limitReached: false });
    assert.equal(state.deletes, 1);
    assert.deepEqual(info.mock.calls[0].arguments, [
        "[cron cleanup-rate-limits]", { deleted: 1, batches: 1, limitReached: false },
    ]);
});

test("database errors return a generic no-store 500 and only redacted diagnostics are logged", async (t) => {
    state.fail = true;
    const logged = t.mock.method(console, "error", () => {});
    const response = await route.GET(request(`Bearer ${secret}`));
    assert.equal(response.status, 500);
    noStore(response);
    assert.deepEqual(await response.json(), {
        error: "INTERNAL_SERVER_ERROR", message: "Unable to clean up rate limits.",
    });
    assert.deepEqual(logged.mock.calls[0].arguments, [
        "[cron cleanup-rate-limits]", { errorClass: "Error" },
    ]);
    assert.equal(state.deletes, 0);
});
