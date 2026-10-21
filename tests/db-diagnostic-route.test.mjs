import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { registerHooks } from "node:module";
import test, { beforeEach, afterEach } from "node:test";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { databaseDiagnosticCategory } from "../src/lib/server/database-diagnostic.ts";

const key = "lifeos.db-diagnostic-tests";
const state = { imports: 0, queries: 0, failure: undefined, importFailure: false };
const privateText = "SYNTHETIC_PRIVATE mysql://fake:fake@invalid/db -----BEGIN CERTIFICATE-----";
state.client = {
    async $queryRaw(strings, ...values) {
        state.queries++;
        assert.deepEqual([...strings], ["SELECT 1"]);
        assert.deepEqual(values, []);
        if (state.failure) {
            throw state.failure;
        }
        return [{ "1": 1 }];
    },
};
globalThis[Symbol.for(key)] = state;
const routeUrl = new URL("../src/app/api/internal/db-diagnostic/route.ts", import.meta.url).href;
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "next/server") {
            return nextResolve("next/server.js", context);
        }
        if (context.parentURL === routeUrl && specifier === "@/lib/prisma") {
            state.imports++;
            if (state.importFailure) {
                throw new Error(privateText);
            }
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
assert.equal(state.imports, 0, "Route initialization must not import Prisma");
const originalEnv = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    DB_DIAGNOSTIC_SECRET: process.env.DB_DIAGNOSTIC_SECRET,
};
// Ephemeral test credential; no configured or fixed secret is stored in the repo.
const credential = randomBytes(32).toString("hex");

beforeEach(() => {
    process.env.VERCEL_ENV = "preview";
    process.env.DB_DIAGNOSTIC_SECRET = credential;
    state.queries = 0;
    state.failure = undefined;
    state.importFailure = false;
});
afterEach(() => {
    for (const [name, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = value;
        }
    }
});

function request(authorization = `Bearer ${credential}`, method = "POST") {
    const result = new Request("https://preview.example.invalid/api/internal/db-diagnostic", {
        method,
        headers: { Authorization: authorization },
    });
    for (const name of ["json", "text", "arrayBuffer", "formData"]) {
        result[name] = () => assert.fail("Must not read the request body");
    }
    return result;
}

function noStore(response) {
    assert.equal(response.headers.get("Cache-Control"), "no-store");
}

test("non-Preview environments return 404 before any Prisma import or query", async () => {
    assert.equal(route.runtime, "nodejs");
    assert.equal(route.dynamic, "force-dynamic");
    const imports = state.imports;
    for (const value of [undefined, "", "production", "development", "Preview"]) {
        if (value === undefined) {
            delete process.env.VERCEL_ENV;
        } else {
            process.env.VERCEL_ENV = value;
        }
        const response = await route.POST(request());
        assert.equal(response.status, 404);
        noStore(response);
        assert.deepEqual(await response.json(), { error: "NOT_FOUND" });
    }
    assert.equal(state.imports, imports);
    assert.equal(state.queries, 0);
});

test("missing configuration and missing/malformed/incorrect bearer credentials fail closed", async () => {
    const imports = state.imports;
    for (const missing of [undefined, "", "   "]) {
        if (missing === undefined) {
            delete process.env.DB_DIAGNOSTIC_SECRET;
        } else {
            process.env.DB_DIAGNOSTIC_SECRET = missing;
        }
        const response = await route.POST(request());
        assert.equal(response.status, 401);
        noStore(response);
    }
    process.env.DB_DIAGNOSTIC_SECRET = credential;
    for (const authorization of ["", "Bearer incorrect", "Basic incorrect", credential, `bearer ${credential}`]) {
        const response = await route.POST(request(authorization));
        assert.equal(response.status, 401);
        noStore(response);
        assert.deepEqual(await response.json(), { error: "UNAUTHORIZED" });
    }
    const missingHeader = request();
    missingHeader.headers.delete("Authorization");
    const response = await route.POST(missingHeader);
    assert.equal(response.status, 401);
    noStore(response);
    assert.equal(state.imports, imports);
    assert.equal(state.queries, 0);
});

test("authorized initialization failure is sanitized without querying", async (t) => {
    const logged = t.mock.method(console, "error", () => {});
    state.importFailure = true;
    const response = await route.POST(request());
    assert.equal(response.status, 503);
    noStore(response);
    assert.deepEqual(await response.json(), {
        ok: false, check: "database_connection", result: "failed", category: "DATABASE_CONFIGURATION",
    });
    assert.equal(state.queries, 0);
    assert.deepEqual(logged.mock.calls[0].arguments, ["[db-diagnostic failed]", "DATABASE_CONFIGURATION"]);
});

test("authorized POST executes exactly SELECT 1 through the imported singleton", async () => {
    const response = await route.POST(request());
    assert.equal(response.status, 200);
    noStore(response);
    assert.deepEqual(await response.json(), {
        ok: true, check: "database_connection", result: "passed",
    });
    assert.equal(state.queries, 1);
});

function prismaFailure(code, cause) {
    return new PrismaClientKnownRequestError(privateText, {
        code,
        clientVersion: "7.10.1",
        meta: { driverAdapterError: { cause }, privateMetadata: privateText },
    });
}

test("database failures return only categories and fixed safe logs, without retries", async (t) => {
    const logged = t.mock.method(console, "error", () => {});
    for (const [error, category] of [
        [prismaFailure("P2039", { originalCode: "45028", originalMessage: privateText }), "CONNECTION_POOL"],
        [prismaFailure("P2010", { originalCode: "45028" }), "CONNECTION_POOL"],
        [prismaFailure("P2039", { cause: { code: "ERR_TLS_CERT_ALTNAME_INVALID" } }), "TLS_VERIFICATION"],
        [prismaFailure("P2039", { kind: "AuthenticationFailed" }), "DATABASE_AUTHENTICATION"],
        [prismaFailure("P2039", { cause: { code: "ENOTFOUND" } }), "NETWORK_OR_DNS"],
        [new Error(privateText), "UNKNOWN_DATABASE_ERROR"],
    ]) {
        state.failure = error;
        state.queries = 0;
        const response = await route.POST(request());
        assert.equal(response.status, 503);
        noStore(response);
        assert.deepEqual(await response.json(), {
            ok: false, check: "database_connection", result: "failed", category,
        });
        assert.equal(state.queries, 1);
        assert.deepEqual(logged.mock.calls.at(-1).arguments, ["[db-diagnostic failed]", category]);
    }
});

test("GET and other methods are rejected without import/query and are never cached", async () => {
    const imports = state.imports;
    for (const environment of ["preview", "production"]) {
        process.env.VERCEL_ENV = environment;
        for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
            const response = await route[method](request(undefined, method));
            assert.equal(response.status, environment === "preview" ? 405 : 404);
            noStore(response);
            if (environment === "preview") {
                assert.equal(response.headers.get("Allow"), "POST");
            }
        }
    }
    assert.equal(state.imports, imports);
    assert.equal(state.queries, 0);
});

test("classification uses structured allowlisted fields, not messages or raw metadata", () => {
    for (const [error, expected] of [
        [{ code: "P1011" }, "TLS_VERIFICATION"],
        [{ errorCode: "P1000" }, "DATABASE_AUTHENTICATION"],
        [{ cause: { errno: 1045 } }, "DATABASE_AUTHENTICATION"],
        [{ cause: { originalCode: "1049" } }, "DATABASE_CONFIGURATION"],
        [{ code: "ECONNREFUSED" }, "NETWORK_OR_DNS"],
        [{ code: "P2039", cause: privateText }, "CONNECTION_POOL"],
        [{ code: "P2039", cause: { message: "CERT_HAS_EXPIRED" } }, "CONNECTION_POOL"],
        [{ code: "P9999", metadata: { code: "P1011" } }, "UNKNOWN_DATABASE_ERROR"],
        [{ code: "constructor" }, "UNKNOWN_DATABASE_ERROR"],
        [privateText, "UNKNOWN_DATABASE_ERROR"],
        [null, "UNKNOWN_DATABASE_ERROR"],
    ]) {
        assert.equal(databaseDiagnosticCategory(error), expected);
    }
    const cyclic = { code: "P2039" };
    cyclic.cause = cyclic;
    assert.equal(databaseDiagnosticCategory(cyclic), "CONNECTION_POOL");
    const guarded = { code: "P2039" };
    for (const name of ["message", "stack", "cause", "meta"]) {
        Object.defineProperty(guarded, name, {
            get() {
                assert.fail(`Must not evaluate ${name}`);
            },
        });
    }
    assert.equal(databaseDiagnosticCategory(guarded), "CONNECTION_POOL");
});
