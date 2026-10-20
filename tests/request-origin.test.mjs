import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { registerHooks } from "node:module";
import { validateMutationOrigin } from "../src/lib/server/request-origin.ts";

const canonical = "https://app.example.com";
const rejection = {
    error: "UNTRUSTED_ORIGIN",
    message: "This request origin is not allowed.",
};

beforeEach(() => {
    process.env.BETTER_AUTH_URL = canonical;
    delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;
    signedIn = true;
    databaseCalls = 0;
    snapshotWrites = 0;
});

function request(headers = {}, method = "POST") {
    return new Request(`${canonical}/api/finance/accounts`, { method, headers });
}

async function assertRejected(input) {
    const response = validateMutationOrigin(input);
    assert.ok(response);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), rejection);
}

test("configured canonical origins normalize case, root slash and default ports", () => {
    process.env.BETTER_AUTH_URL = "https://APP.example.com:443/";
    assert.equal(validateMutationOrigin(request({ Origin: canonical })), null);
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    assert.equal(validateMutationOrigin(request({ Origin: "http://localhost:3000" })), null);
});

test("additional exact origins use Better Auth's comma-separated variable", async () => {
    process.env.BETTER_AUTH_TRUSTED_ORIGINS = "https://preview.example.com,https://alternate.invalid";
    assert.equal(validateMutationOrigin(request({
        Origin: "https://preview.example.com", "Sec-Fetch-Site": "same-site",
    })), null);
    // An allowlist entry never overrides browser evidence of a cross-site request.
    await assertRejected(request({
        Origin: "https://alternate.invalid", "Sec-Fetch-Site": "cross-site",
    }));
});

test("missing canonical configuration fails closed in production, even with approved extras", async (t) => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    t.after(() => {
        if (previous === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = previous;
        }
    });
    delete process.env.BETTER_AUTH_URL;
    process.env.BETTER_AUTH_TRUSTED_ORIGINS = canonical;
    await assertRejected(request({ Origin: canonical }));
});

test("invalid configuration rejects the whole policy without revealing it", async () => {
    for (const entry of [
        "", "null", "not-a-url", "ftp://app.example.com", "https://*.example.com",
        "https://user:password@app.example.com", "https://@app.example.com",
        `${canonical}/path`, `${canonical}/path/..`, `${canonical}/.`,
        `${canonical}?query=value`, `${canonical}?`, `${canonical}#fragment`, `${canonical}#`,
        "https:\\app.example.com", " https://app.example.com", "https://app.example.com ",
    ]) {
        process.env.BETTER_AUTH_URL = entry;
        await assertRejected(request({ Origin: canonical }));
        process.env.BETTER_AUTH_URL = canonical;
        process.env.BETTER_AUTH_TRUSTED_ORIGINS = `${canonical},${entry}`;
        await assertRejected(request({ Origin: canonical }));
        delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;
    }
});

test("scheme, hostname and port must match; same-site siblings and lookalikes are untrusted", async () => {
    for (const origin of [
        "http://app.example.com", "https://app.example.com:444",
        "https://app.example.com.evil.invalid", "https://evilapp.example.com",
        "https://sibling.example.com", "http://localhost:3000",
    ]) {
        await assertRejected(request({ Origin: origin, "Sec-Fetch-Site": "same-site" }));
    }
});

test("a present malformed, opaque or untrusted Origin cannot fall back to a trusted Referer", async () => {
    for (const origin of [
        "", "null", "NULL", "/relative", "https://evil.invalid",
        `${canonical}/path`, `${canonical}?query`, `${canonical}#fragment`,
        "https://user@app.example.com", `${canonical},https://evil.invalid`,
        "https:\\app.example.com", "https://app.example.com\t.evil.invalid",
    ]) {
        await assertRejected(request({ Origin: origin, Referer: `${canonical}/finance` }));
    }
});

test("absent Origin requires a valid trusted HTTP(S) Referer", async () => {
    assert.equal(validateMutationOrigin(request({ Referer: `${canonical}/finance?tab=accounts` })), null);
    for (const referer of [
        "", "null", "/finance", "not-a-url", "ftp://app.example.com/finance",
        "https://evil.invalid/finance", "https://user@app.example.com/finance",
        "https:\\app.example.com/finance",
    ]) {
        await assertRejected(request({ Referer: referer }));
    }
    await assertRejected(request());
    await assertRejected(request({ "Sec-Fetch-Site": "same-origin" }));
});

test("Fetch Metadata supplements the allowlist and never replaces it", async () => {
    for (const site of ["same-origin", "same-site", "none"]) {
        assert.equal(validateMutationOrigin(request({ Origin: canonical, "Sec-Fetch-Site": site })), null);
    }
    for (const site of ["cross-site", "", "invalid", "same-origin, cross-site"]) {
        await assertRejected(request({ Origin: canonical, "Sec-Fetch-Site": site }));
    }
});

test("request and forwarded hosts never establish trust", async () => {
    await assertRejected(request({
        Origin: "https://evil.invalid", Host: "app.example.com",
        "X-Forwarded-Host": "app.example.com", "X-Forwarded-Proto": "https",
    }));
    await assertRejected(request({ Host: "app.example.com", "X-Forwarded-Host": "app.example.com" }));
});

test("safe read methods need no origin or configured canonical origin; PATCH is guarded", async () => {
    delete process.env.BETTER_AUTH_URL;
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
        assert.equal(validateMutationOrigin(request({}, method)), null);
    }
    await assertRejected(request({}, "PATCH"));
});

const stateKey = "lifeos.request-origin-tests";
const dependencies = {};
globalThis[Symbol.for(stateKey)] = dependencies;
let signedIn = true;
let databaseCalls = 0;
let snapshotWrites = 0;

dependencies.auth = {
    api: {
        async getSession() {
            return signedIn ? { user: { id: "synthetic-user" } } : null;
        },
    },
};

const model = {
    async findMany() {
        databaseCalls++;
        return [];
    },
    async findFirst() {
        databaseCalls++;
        return null;
    },
    async findUnique() {
        databaseCalls++;
        return null;
    },
    async deleteMany() {
        databaseCalls++;
        return { count: 0 };
    },
};
dependencies.prisma = {
    async $transaction(callback) {
        databaseCalls++;
        return callback(dependencies.prisma);
    },
    bankAccount: model,
    investment: model,
    liability: model,
    financeTransaction: model,
    healthLog: model,
    healthTargets: model,
    financialPositionSnapshot: {
        ...model,
        async create() {
            snapshotWrites++;
            throw new Error("No rejected request may write position history");
        },
    },
};

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (["@/lib/auth", "@/lib/prisma"].includes(specifier)) {
            const name = specifier.endsWith("auth") ? "auth" : "prisma";
            const source = `export const ${name} = globalThis[
                Symbol.for(${JSON.stringify(stateKey)})
            ].${name};`;
            return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        }
        if (specifier.startsWith("@/")) {
            return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
        }
        if (specifier === "next/server") {
            return nextResolve("next/server.js", context);
        }
        return nextResolve(specifier, context);
    },
});

const operations = [];
for (const resource of ["accounts", "investments", "liabilities", "transactions"]) {
    const collection = await import(`../src/app/api/finance/${resource}/route.ts`);
    const item = await import(`../src/app/api/finance/${resource}/[id]/route.ts`);
    operations.push(
        { path: `/api/finance/${resource}`, method: "POST", handler: collection.POST },
        { path: `/api/finance/${resource}/synthetic-id`, method: "PUT", handler: item.PUT },
        { path: `/api/finance/${resource}/synthetic-id`, method: "DELETE", handler: item.DELETE },
    );
}
const logs = await import("../src/app/api/health/logs/route.ts");
const logItem = await import("../src/app/api/health/logs/[id]/route.ts");
const targets = await import("../src/app/api/health/targets/route.ts");
operations.push(
    { path: "/api/health/logs", method: "POST", handler: logs.POST },
    { path: "/api/health/logs/synthetic-id", method: "DELETE", handler: logItem.DELETE },
    { path: "/api/health/targets", method: "PUT", handler: targets.PUT },
    { path: "/api/health/targets", method: "DELETE", handler: targets.DELETE },
);

for (const operation of operations) {
    test(`${operation.method} ${operation.path} blocks hostile requests before parsing or database access`, async (t) => {
        for (const headers of [
            { Origin: "https://evil.invalid", "Sec-Fetch-Site": "cross-site" },
            { Origin: "https://sibling.example.com", "Sec-Fetch-Site": "same-site" },
            { Origin: "null" }, {},
        ]) {
            const input = new Request(`${canonical}${operation.path}`, {
                method: operation.method,
                headers,
            });
            t.mock.method(input, "json", () => {
                throw new Error("Origin rejection must precede body parsing");
            });
            let paramsRead = false;
            const response = await operation.handler(input, {
                params: {
                    then(resolve) {
                        paramsRead = true;
                        resolve({ id: "synthetic-id" });
                    },
                },
            });
            assert.equal(response.status, 403);
            assert.equal(response.headers.get("cache-control"), "private, no-store");
            assert.deepEqual(await response.json(), rejection);
            assert.equal(paramsRead, false);
            assert.equal(databaseCalls, 0);
            assert.equal(snapshotWrites, 0);
        }
    });

    test(`${operation.method} ${operation.path} preserves same-origin 401 and business validation`, async () => {
        function input() {
            return new Request(`${canonical}${operation.path}`, {
                method: operation.method,
                headers: { Origin: canonical, "Sec-Fetch-Site": "same-origin" },
            });
        }
        const context = { params: Promise.resolve({ id: "synthetic-id" }) };
        signedIn = false;
        const unauthenticated = await operation.handler(input(), context);
        assert.equal(unauthenticated.status, 401);
        assert.equal((await unauthenticated.json()).error, "UNAUTHORIZED");
        assert.equal(databaseCalls, 0);

        signedIn = true;
        const response = await operation.handler(input(), context);
        if (operation.method !== "DELETE") {
            assert.equal(response.status, 400);
            assert.equal((await response.json()).error, "INVALID_INPUT");
        } else if (operation.path !== "/api/health/targets") {
            assert.equal(response.status, 404);
            assert.equal((await response.json()).error, "NOT_FOUND");
        } else {
            assert.equal(response.status, 200);
            assert.deepEqual(await response.json(), { success: true, targets: null });
        }
        assert.equal(snapshotWrites, 0);
    });
}

test("all five transaction types are rejected before ledger or position history access", async () => {
    const transactionOperations = operations.filter(
        (item) => item.path.includes("transactions") && item.method !== "DELETE",
    );
    for (const type of ["income", "expense", "transfer", "investment_purchase", "investment_sale"]) {
        for (const operation of transactionOperations) {
            const input = new Request(`${canonical}${operation.path}`, {
                method: operation.method,
                headers: { Origin: "https://evil.invalid", "Content-Type": "application/json" },
                body: JSON.stringify({ type, amount: 10, accountId: "synthetic-account" }),
            });
            const response = await operation.handler(input, {
                params: Promise.resolve({ id: "synthetic-id" }),
            });
            assert.equal(response.status, 403);
            assert.deepEqual(await response.json(), rejection);
        }
    }
    assert.equal(databaseCalls, 0);
    assert.equal(snapshotWrites, 0);
});

test("a cross-site HTML form is rejected before its simple request body is parsed", async (t) => {
    const input = new Request(`${canonical}/api/health/logs`, {
        method: "POST",
        headers: {
            Origin: "https://evil.invalid", "Sec-Fetch-Site": "cross-site",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "date=2026-10-18&steps=4000",
    });
    t.mock.method(input, "json", () => {
        throw new Error("Do not parse an untrusted form");
    });
    const response = await logs.POST(input);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), rejection);
    assert.equal(databaseCalls, 0);
});

test("Finance and Health GET endpoints work without Origin headers", async () => {
    for (const name of ["finance", "health"]) {
        const route = await import(`../src/app/api/${name}/route.ts`);
        const response = await route.GET(new Request(`${canonical}/api/${name}`));
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("cache-control"), "private, no-store");
    }
});
