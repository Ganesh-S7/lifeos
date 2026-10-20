import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { registerHooks } from "node:module";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { getCookies } from "better-auth/cookies";
import {
    PHASE_DEVELOPMENT_SERVER,
    PHASE_PRODUCTION_BUILD,
    PHASE_PRODUCTION_SERVER,
} from "next/constants.js";

const { authOptions } = await import("../src/lib/server/auth-config.ts");
const { configuredTrustedOrigins, parseOrigin } = await import("../src/lib/server/trusted-origins.ts");
const { validateMutationOrigin } = await import("../src/lib/server/request-origin.ts");
const { default: nextConfig } = await import("../next.config.ts");

const canonical = "https://app.example.invalid";
const syntheticSecret = "synthetic-AuthConfig-Test-ONLY-0123456789-AbCdEf!";
const environment = {
    NODE_ENV: "production",
    BETTER_AUTH_URL: canonical,
    BETTER_AUTH_SECRET: syntheticSecret,
};

beforeEach(() => {
    process.env.BETTER_AUTH_URL = canonical;
    delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;
    delete process.env.LIFEOS_NEXT_PHASE;
});

function options(overrides = {}) {
    return authOptions({ ...environment, ...overrides });
}

function testAuth(config) {
    return betterAuth({
        ...config,
        database: memoryAdapter({ user: [], account: [], session: [], verification: [] }),
        logger: { disabled: true },
    });
}

test("localhost HTTP remains supported in development; production HTTPS is canonical", () => {
    const local = options({ NODE_ENV: "development", BETTER_AUTH_URL: "http://localhost:3000" });
    assert.equal(local.baseURL, "http://localhost:3000");
    assert.equal(local.advanced.useSecureCookies, false);
    assert.equal(local.rateLimit.enabled, false);
    assert.equal(options().baseURL, canonical);
    assert.equal(options({ BETTER_AUTH_URL: "https://APP.example.invalid:443/" }).baseURL, canonical);
});

test("production rejects absent, malformed, HTTP and non-origin canonical URLs", () => {
    for (const BETTER_AUTH_URL of [
        undefined, "", "null", "invalid", "http://app.example.invalid", "http://localhost:3000",
        "https://user:password@app.example.invalid", `${canonical}/path`, `${canonical}/path/..`,
        `${canonical}?`, `${canonical}#`, "https://*.example.invalid", "https://%2A.example.invalid",
    ]) {
        assert.throws(() => options({ BETTER_AUTH_URL }));
    }
});

test("required auth secrets fail safely without echoing their contents", () => {
    for (const secret of [undefined, "", "synthetic-short-secret"]) {
        assert.throws(() => options({ BETTER_AUTH_SECRET: secret }), (error) => {
            assert.equal(error.message.includes("synthetic"), false);
            return true;
        });
    }
});

test("documented Next config phases allow loopback builds but restore strict runtime validation", () => {
    const previous = process.env.LIFEOS_NEXT_PHASE;
    try {
        const buildConfig = nextConfig(PHASE_PRODUCTION_BUILD);
        assert.equal(buildConfig.reactCompiler, true);
        assert.equal(buildConfig.env, undefined, "Never inline the build phase into the artifact");
        const local = { BETTER_AUTH_URL: "http://localhost:3000" };
        assert.equal(options({ ...local, LIFEOS_NEXT_PHASE: process.env.LIFEOS_NEXT_PHASE }).baseURL,
            "http://localhost:3000");
        assert.throws(() => options({
            BETTER_AUTH_URL: "http://app.example.invalid", LIFEOS_NEXT_PHASE: PHASE_PRODUCTION_BUILD,
        }), /must use HTTPS/);
        assert.throws(() => options({
            BETTER_AUTH_URL: "http://localhost.evil.invalid", LIFEOS_NEXT_PHASE: PHASE_PRODUCTION_BUILD,
        }), /must use HTTPS/);

        nextConfig(PHASE_PRODUCTION_SERVER);
        assert.throws(() => options({ ...local, LIFEOS_NEXT_PHASE: process.env.LIFEOS_NEXT_PHASE }),
            /must use HTTPS/);
        assert.throws(() => options(local), /must use HTTPS/, "Cold serverless runtime has no build marker");
        nextConfig(PHASE_DEVELOPMENT_SERVER);
        assert.equal(options({ ...local, NODE_ENV: "development" }).baseURL, "http://localhost:3000");
    } finally {
        if (previous === undefined) {
            delete process.env.LIFEOS_NEXT_PHASE;
        } else {
            process.env.LIFEOS_NEXT_PHASE = previous;
        }
    }
});

test("shared origin policy normalizes exact entries and rejects wildcard hosts", async () => {
    const additional = "https://PREVIEW.example.invalid:443/,https://preview.example.invalid";
    process.env.BETTER_AUTH_TRUSTED_ORIGINS = additional;
    const config = options({ BETTER_AUTH_TRUSTED_ORIGINS: additional });
    assert.deepEqual(config.trustedOrigins, [canonical, "https://preview.example.invalid"]);
    assert.deepEqual(config.trustedOrigins, [...configuredTrustedOrigins()]);

    const context = await testAuth(config).$context;
    assert.equal(context.isTrustedOrigin(canonical), true);
    assert.equal(context.isTrustedOrigin("https://preview.example.invalid"), true);
    assert.equal(context.isTrustedOrigin("https://unapproved-preview.vercel.app"), false);
    assert.equal(context.isTrustedOrigin("https://preview.example.invalid.evil.invalid"), false);
    assert.equal(context.isTrustedOrigin("http://preview.example.invalid"), false);
    assert.equal(context.isTrustedOrigin("https://preview.example.invalid:444"), false);

    for (const entry of [
        "https://*.example.invalid", "https://%2A.example.invalid", `${canonical}/path`,
        "https://user@app.example.invalid", `${canonical}?q=1`, `${canonical}#fragment`,
        "not-an-origin", `${canonical},`,
    ]) {
        assert.throws(() => options({ BETTER_AUTH_TRUSTED_ORIGINS: entry }));
        process.env.BETTER_AUTH_TRUSTED_ORIGINS = entry;
        const response = validateMutationOrigin(new Request(`${canonical}/api/finance/accounts`, {
            method: "POST", headers: { Origin: canonical },
        }));
        assert.equal(response.status, 403);
    }
    assert.equal(parseOrigin("https://%2A.example.invalid"), null);
    assert.throws(() => options({ BETTER_AUTH_TRUSTED_ORIGINS: "http://preview.example.invalid" }),
        /must use HTTPS/);
});

test("production HTTP auth is rejected even with a retained build marker", async () => {
    const config = options({
        BETTER_AUTH_URL: "http://localhost:3000", LIFEOS_NEXT_PHASE: PHASE_PRODUCTION_BUILD,
    });
    const db = { user: [], account: [], session: [], verification: [] };
    const auth = betterAuth({ ...config, database: memoryAdapter(db), logger: { disabled: true } });
    const response = await auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Synthetic build marker test", email: "synthetic-build-marker@example.invalid",
            password: "Synthetic-Password-ONLY-1234!",
        }),
    }));
    assert.equal(response.status, 500);
    assert.equal(db.user.length, 0);
    assert.equal(db.session.length, 0);
    await assert.rejects(auth.api.getSession({ headers: new Headers() }), /configuration is invalid/);
});

test("real Better Auth cookie generation is Secure, HttpOnly, Lax and host-only in production", () => {
    const production = getCookies(options()).sessionToken;
    assert.equal(production.attributes.secure, true);
    assert.equal(production.attributes.httpOnly, true);
    assert.equal(production.attributes.sameSite, "lax");
    assert.equal(production.attributes.domain, undefined);
    assert.equal(production.name.startsWith("__Secure-"), true);

    const local = getCookies(options({
        NODE_ENV: "development", BETTER_AUTH_URL: "http://localhost:3000",
    })).sessionToken;
    assert.equal(local.attributes.secure, false);
    assert.equal(local.attributes.httpOnly, true);
    assert.equal(local.attributes.sameSite, "lax");
});

test("public signup, password policy and Better Auth CSRF protections remain enabled", () => {
    const config = options();
    assert.equal(config.emailAndPassword.enabled, true);
    assert.equal(config.emailAndPassword.disableSignUp, false);
    assert.equal(config.emailAndPassword.minPasswordLength, 8);
    assert.equal(config.emailAndPassword.maxPasswordLength, 128);
    assert.equal(config.emailAndPassword.requireEmailVerification, false);
    assert.equal(config.emailAndPassword.autoSignIn, undefined);
    assert.equal(config.emailAndPassword.sendResetPassword, undefined);
    assert.equal(config.emailVerification, undefined);
    assert.equal(config.session, undefined);
    assert.equal(config.advanced.disableCSRFCheck, false);
    assert.equal(config.advanced.disableOriginCheck, false);
    assert.equal(config.advanced.trustedProxyHeaders, false);
    assert.equal(config.advanced.crossSubDomainCookies.enabled, false);
});

test("installed Better Auth enforces the configured per-path memory rate limits", async () => {
    const config = options();
    // Better Auth's memory buckets are module-wide. Give this fixture a distinct
    // synthetic IP so earlier request tests cannot consume its route budgets.
    const auth = testAuth({
        ...config,
        advanced: {
            ...config.advanced,
            ipAddress: { ipAddressHeaders: ["x-lifeos-test-ip"] },
        },
    });
    const context = await auth.$context;
    assert.equal(context.rateLimit.storage, "memory");
    assert.equal(context.rateLimit.enabled, true);
    assert.equal(context.rateLimit.window, 60);
    assert.equal(context.rateLimit.max, 100);

    for (const [path, rule] of Object.entries(config.rateLimit.customRules)) {
        for (let index = 0; index < rule.max + 1; index++) {
            const method = path === "/verify-email" ? "GET" : "POST";
            const response = await auth.handler(new Request(`${canonical}/api/auth${path}`, {
                method,
                headers: {
                    Origin: canonical,
                    "Content-Type": "application/json",
                    "x-lifeos-test-ip": "192.0.2.20",
                },
                ...(method === "POST" ? { body: "{}" } : {}),
            }));
            if (index < rule.max) {
                assert.notEqual(response.status, 429);
            } else {
                assert.equal(response.status, 429, path);
                assert.ok(Number(response.headers.get("X-Retry-After")) > 0);
            }
        }
    }
});

test("localhost signup, email uniqueness, sign-in and logout work with the memory adapter", async () => {
    const origin = "http://localhost:3000";
    const auth = testAuth(options({ NODE_ENV: "development", BETTER_AUTH_URL: origin }));
    const email = "synthetic-auth-test@example.invalid";
    const password = "Synthetic-Password-ONLY-1234!";
    async function call(path, body, cookie) {
        const headers = { Origin: origin, "Content-Type": "application/json" };
        if (cookie) {
            headers.Cookie = cookie;
        }
        return auth.handler(new Request(`${origin}/api/auth${path}`, {
            method: body ? "POST" : "GET",
            headers,
            ...(body ? { body: JSON.stringify(body) } : {}),
        }));
    }
    function cookies(response) {
        return response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    }

    const signup = await call("/sign-up/email", { email, password, name: "Synthetic auth test" });
    assert.equal(signup.status, 200);
    const user = (await signup.json()).user;
    assert.equal(user.emailVerified, false);
    const signupCookie = cookies(signup);
    assert.ok(signupCookie.length > 0);
    const session = await call("/get-session", undefined, signupCookie);
    assert.equal((await session.json()).user.id, user.id);

    const duplicate = await call("/sign-up/email", { email, password, name: "Synthetic auth test" });
    assert.equal(duplicate.status, 422);
    assert.equal((await duplicate.json()).code, "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL");

    assert.equal((await call("/sign-out", {}, signupCookie)).status, 200);
    assert.equal(await (await call("/get-session", undefined, signupCookie)).json(), null);
    const signin = await call("/sign-in/email", { email, password });
    assert.equal(signin.status, 200);
    const signinCookie = cookies(signin);
    assert.ok(signinCookie.length > 0);

    const hostile = await auth.handler(new Request(`${origin}/api/auth/sign-out`, {
        method: "POST",
        headers: { Origin: "https://evil.invalid", Cookie: signinCookie },
    }));
    assert.equal(hostile.status, 403);
    assert.equal((await (await call("/get-session", undefined, signinCookie)).json()).user.id, user.id);
    assert.equal((await call("/sign-out", {}, signinCookie)).status, 200);
    assert.equal(await (await call("/get-session", undefined, signinCookie)).json(), null);
});

const key = "lifeos.auth-config-test.factory";
const capture = {};
globalThis[Symbol.for(key)] = capture;
const authUrl = new URL("../src/lib/auth.ts", import.meta.url).href;
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (context.parentURL?.split("?")[0] === authUrl) {
            const stubs = {
                "dotenv/config": "export {};",
                "./prisma": "export const prisma = {};",
                "better-auth": `export function betterAuth(options) {
                    globalThis[Symbol.for(${JSON.stringify(key)})].options = options;
                    return { options };
                }`,
                "better-auth/adapters/prisma": `export function prismaAdapter(client, options) {
                    globalThis[Symbol.for(${JSON.stringify(key)})].adapter = options;
                    return { syntheticAdapter: true };
                }`,
            };
            if (stubs[specifier]) {
                return {
                    url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`,
                    shortCircuit: true,
                };
            }
        }
        return nextResolve(specifier, context);
    },
});

test("auth.ts passes the validated configuration to Better Auth with the unchanged MySQL adapter", async () => {
    const saved = {
        NODE_ENV: process.env.NODE_ENV,
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    };
    try {
        process.env.NODE_ENV = "production";
        process.env.BETTER_AUTH_SECRET = syntheticSecret;
        await import(`${authUrl}?auth-config-test`);
        assert.equal(capture.options.baseURL, canonical);
        assert.deepEqual(capture.options.trustedOrigins, [canonical]);
        assert.equal(capture.options.advanced.useSecureCookies, true);
        assert.equal(capture.options.rateLimit.storage, "memory");
        assert.deepEqual(capture.adapter, { provider: "mysql" });
    } finally {
        for (const [name, value] of Object.entries(saved)) {
            if (value === undefined) {
                delete process.env[name];
            } else {
                process.env[name] = value;
            }
        }
    }
});
