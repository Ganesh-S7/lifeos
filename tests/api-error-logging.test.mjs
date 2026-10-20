import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import {
    PrismaClientInitializationError,
    PrismaClientKnownRequestError,
    PrismaClientValidationError,
} from "@prisma/client/runtime/client";

import { errorDiagnostics } from "../src/lib/server/error-diagnostics.ts";

// Deliberately synthetic examples; no real credentials or user records.
const privateText = "SYNTHETIC_PRIVATE SELECT * FROM health_logs; token=FAKE_TOKEN";

function knownError(code = "P2010") {
    const error = new PrismaClientKnownRequestError(privateText, {
        code,
        clientVersion: privateText,
        meta: {
            query: privateText,
            parameters: ["SYNTHETIC_USER", "SYNTHETIC_HEALTH_MEASUREMENT"],
            financialRecord: "SYNTHETIC_FINANCIAL_RECORD",
            driverAdapterError: {
                cause: { originalMessage: privateText, originalCode: privateText },
            },
        },
    });
    error.stack = privateText;
    error.cause = new Error(privateText);
    return error;
}

test("Prisma diagnostics contain only fixed class labels and allowlisted codes", () => {
    for (const code of ["P2002", "P2003", "P2010", "P2024", "P2025", "P2028", "P2034"]) {
        assert.deepEqual(errorDiagnostics(knownError(code)), {
            errorClass: "PrismaClientKnownRequestError",
            prismaCode: code,
        });
    }

    for (const code of ["P2999", privateText]) {
        assert.deepEqual(errorDiagnostics(knownError(code)), {
            errorClass: "PrismaClientKnownRequestError",
        });
    }

    assert.deepEqual(errorDiagnostics(
        new PrismaClientInitializationError(privateText, privateText, "P1001"),
    ), {
        errorClass: "PrismaClientInitializationError",
        prismaCode: "P1001",
    });
    assert.deepEqual(errorDiagnostics(
        new PrismaClientValidationError(privateText, { clientVersion: privateText }),
    ), { errorClass: "PrismaClientValidationError" });
});

test("diagnostics never read messages, stacks, metadata, causes or arbitrary class names", () => {
    const error = knownError();
    for (const field of ["message", "stack", "meta", "cause", "name", "constructor"]) {
        Object.defineProperty(error, field, {
            get() {
                throw new Error(`Diagnostic must not inspect ${field}`);
            },
        });
    }
    assert.deepEqual(errorDiagnostics(error), {
        errorClass: "PrismaClientKnownRequestError",
        prismaCode: "P2010",
    });

    const customError = new Error(privateText);
    Object.defineProperty(customError, "constructor", { value: { name: privateText } });
    customError.name = privateText;
    customError.stack = privateText;
    assert.deepEqual(errorDiagnostics(customError), { errorClass: "Error" });

    for (const value of [null, undefined, privateText, { code: "P2034", message: privateText }]) {
        assert.deepEqual(errorDiagnostics(value), { errorClass: "UnknownError" });
    }
});

const key = "lifeos.api-error-logging-tests";
const dependencies = {};
globalThis[Symbol.for(key)] = dependencies;

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (["@/lib/auth", "@/lib/prisma"].includes(specifier)) {
            const name = specifier.endsWith("auth") ? "auth" : "prisma";
            const source = `export const ${name} = globalThis[
                Symbol.for(${JSON.stringify(key)})
            ].${name};`;
            return {
                url: `data:text/javascript,${encodeURIComponent(source)}`,
                shortCircuit: true,
            };
        }
        if (specifier.startsWith("@/")) {
            return nextResolve(
                new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href,
                context,
            );
        }
        if (specifier === "next/server") {
            return nextResolve("next/server.js", context);
        }
        return nextResolve(specifier, context);
    },
});

let signedIn = true;
let failure;
async function databaseResult(value) {
    if (failure) {
        throw failure;
    }
    return value;
}

dependencies.auth = {
    api: {
        async getSession() {
            return signedIn ? { user: { id: "synthetic-user" } } : null;
        },
    },
};
dependencies.prisma = {
    async $transaction() {
        return databaseResult({
            accounts: [], investments: [], liabilities: [], transactions: [], positionHistory: [],
        });
    },
    healthLog: {
        async findMany() {
            return databaseResult([]);
        },
        async findUnique() {
            return databaseResult(null);
        },
        async deleteMany() {
            return databaseResult({ count: 0 });
        },
    },
    healthTargets: {
        async findUnique() {
            return databaseResult(null);
        },
        async upsert() {
            return databaseResult(null);
        },
        async deleteMany() {
            return databaseResult({ count: 0 });
        },
    },
};

const finance = await import("../src/app/api/finance/route.ts");
const health = await import("../src/app/api/health/route.ts");
const logs = await import("../src/app/api/health/logs/route.ts");
const logItem = await import("../src/app/api/health/logs/[id]/route.ts");
const targets = await import("../src/app/api/health/targets/route.ts");
const operations = [
    {
        method: "GET", path: "/api/finance", handler: finance.GET,
        message: "Unable to load your finance data.",
    },
    {
        method: "GET", path: "/api/health", handler: health.GET,
        message: "Unable to load your health data.",
    },
    {
        method: "POST", path: "/api/health/logs", handler: logs.POST,
        body: { date: "2026-10-18", steps: 4000 },
        message: "Unable to save your health log.",
    },
    {
        method: "DELETE", path: "/api/health/logs/[id]", handler: logItem.DELETE,
        message: "Unable to delete your health log.",
    },
    {
        method: "PUT", path: "/api/health/targets", handler: targets.PUT,
        body: { stepsPerDay: 8000 },
        message: "Unable to save your health targets.",
    },
    {
        method: "DELETE", path: "/api/health/targets", handler: targets.DELETE,
        message: "Unable to clear your health targets.",
    },
];

async function invoke(operation, body = operation.body, id = "synthetic-log") {
    const request = new Request(`http://localhost${operation.path}`, {
        method: operation.method,
        ...(body ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        } : {}),
    });
    const response = await operation.handler(request, { params: Promise.resolve({ id }) });
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    return { status: response.status, body: await response.json() };
}

for (const operation of operations) {
    test(`${operation.method} ${operation.path} redacts failures and preserves HTTP 500`, async (t) => {
        const errors = [];
        t.mock.method(console, "error", (...args) => errors.push(args));
        signedIn = true;

        for (const error of [knownError(), knownError(privateText), new Error(privateText), privateText]) {
            failure = error;
            const result = await invoke(operation);
            assert.deepEqual(result, {
                status: 500,
                body: { error: "INTERNAL_SERVER_ERROR", message: operation.message },
            });
            assert.deepEqual(errors.at(-1), [
                `[${operation.method} ${operation.path}]`,
                errorDiagnostics(error),
            ]);
        }

        assert.equal(errors.length, 4);
        assert.doesNotMatch(
            JSON.stringify(errors),
            /SYNTHETIC|SELECT|FAKE_TOKEN|parameters|stack|clientVersion|driverAdapterError/,
        );
    });
}

test("Health authentication, validation, missing records and duplicate-date contracts stay unchanged", async (t) => {
    const errors = [];
    t.mock.method(console, "error", (...args) => errors.push(args));
    failure = null;
    signedIn = false;
    for (const operation of operations) {
        const result = await invoke(operation);
        assert.equal(result.status, 401);
        assert.equal(result.body.error, "UNAUTHORIZED");
    }

    signedIn = true;
    const invalidDate = await invoke(operations[2], { date: "2026-02-30", steps: 4000 });
    assert.equal(invalidDate.status, 400);
    assert.equal(invalidDate.body.error, "INVALID_INPUT");

    const invalidTarget = await invoke(operations[4], { stepsPerDay: -1 });
    assert.equal(invalidTarget.status, 400);
    assert.equal(invalidTarget.body.error, "INVALID_INPUT");

    const invalidId = await invoke(operations[3], undefined, " ");
    assert.equal(invalidId.status, 400);
    assert.equal(invalidId.body.error, "INVALID_INPUT");

    assert.deepEqual(await invoke(operations[3]), {
        status: 404,
        body: { error: "NOT_FOUND", message: "Health log not found." },
    });

    failure = knownError("P2002");
    assert.deepEqual(await invoke(operations[2]), {
        status: 409,
        body: {
            error: "DUPLICATE_DATE",
            message: "A health log already exists for this date.",
        },
    });
    assert.deepEqual(errors, []);
});
