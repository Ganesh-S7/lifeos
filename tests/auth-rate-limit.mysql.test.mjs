import "./helpers/register-typescript.mjs";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { randomInt, randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

// Explicit opt-in: never connect to a hosted datasource or apply migrations here.
test("native database limiter shares atomic counters across independent MySQL clients", {
    skip: process.env.LIFEOS_TEST_MYSQL_RATE_LIMIT !== "1",
    timeout: 120_000,
}, async (t) => {
    const target = new URL(process.env.DATABASE_URL);
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname),
        "Integration tests require a loopback MySQL datasource");
    const { PrismaClient } = await import("../src/generated/prisma/client.ts");
    const { databaseAdapterOptions } = await import("../src/lib/server/database-config.ts");
    const { authOptions } = await import("../src/lib/server/auth-config.ts");
    const origin = "https://rate-limit.example.invalid";
    const config = authOptions({
        NODE_ENV: "production",
        VERCEL: "1",
        BETTER_AUTH_URL: origin,
        BETTER_AUTH_SECRET: "Synthetic-Rate-Limit-Test-Secret-ONLY-0123456789",
    });
    const clients = Array.from({ length: 2 }, () => new PrismaClient({
        adapter: new PrismaMariaDb(databaseAdapterOptions()),
    }));
    const { rateLimitSafeAdapter } = await import("../src/lib/server/auth-rate-limit-adapter.ts");
    const instances = clients.map((client) => betterAuth({
        ...config,
        // Synthetic platform headers test the configured parser, not whether
        // Vercel overwrites client-supplied values at its deployed ingress.
        database: rateLimitSafeAdapter(prismaAdapter(client, { provider: "mysql" }), client),
        logger: { disabled: true },
    }));
    const keys = new Set();
    let serial = randomInt(1, 2 ** 24);
    async function fixture(path) {
        const value = serial++;
        const ip = `10.${(value >> 16) & 255}.${(value >> 8) & 255}.${value & 255}`;
        const key = `${ip}|${path}`;
        assert.equal(await clients[0].rateLimit.count({ where: { key } }), 0,
            "Refuse to reuse an existing counter");
        keys.add(key);
        return { ip, key };
    }
    const email = `lifeos-task21-${randomUUID()}@example.invalid`;
    let userId;
    async function request(index, path, ip, body, cookie) {
        const method = path === "/verify-email" || path === "/get-session" ? "GET" : "POST";
        return instances[index % 2].handler(new Request(`${origin}/api/auth${path}`, {
            method,
            headers: {
                Origin: origin,
                "Content-Type": "application/json",
                "x-vercel-forwarded-for": ip,
                ...(cookie ? { Cookie: cookie } : {}),
            },
            ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
        }));
    }
    try {
        await t.test("all actual routes share thresholds between instances", async () => {
            const rules = { ...config.rateLimit.customRules, "/get-session": { max: 100, window: 60 } };
            for (const [path, rule] of Object.entries(rules)) {
                const { ip, key } = await fixture(path);
                assert.equal(await clients[0].rateLimit.count({ where: { key } }), 0);
                for (let index = 0; index <= rule.max; index++) {
                    const response = await request(index, path, ip);
                    assert.equal(response.status, index === rule.max ? 429 : path === "/get-session" ? 200 : 400);
                }
                assert.equal((await clients[1].rateLimit.findUniqueOrThrow({ where: { key } })).count, rule.max);
            }
        });
        await t.test("concurrent first requests and existing-row increments cannot bypass limits", async () => {
            for (let round = 0; round < 4; round++) {
                const { ip, key } = await fixture("/sign-in/email");
                if (round % 2) {
                    assert.equal((await request(0, "/sign-in/email", ip)).status, 400);
                }
                const responses = await Promise.all(Array.from({ length: 20 }, (_, index) =>
                    request(index, "/sign-in/email", ip)));
                assert.equal(responses.filter((response) => response.status === 400).length, round % 2 ? 2 : 3);
                assert.ok(responses.every((response) => [400, 429].includes(response.status)));
                assert.equal((await clients[0].rateLimit.findUniqueOrThrow({ where: { key } })).count, 3);
            }
        });
        await t.test("renewal uses last accepted request; concurrent renewal and cleanup are safe", async () => {
            const { ip, key } = await fixture("/sign-in/email");
            for (let index = 0; index < 3; index++) {
                await request(index, "/sign-in/email", ip);
            }
            const recent = BigInt(Date.now() - 30_000);
            await clients[0].rateLimit.update({ where: { key }, data: { lastRequest: recent } });
            assert.equal((await request(1, "/sign-in/email", ip)).status, 429);
            assert.equal((await clients[0].rateLimit.findUniqueOrThrow({ where: { key } })).lastRequest, recent,
                "Denied requests must not extend the window");
            const expired = await fixture("/get-session");
            await clients[0].rateLimit.create({ data: {
                id: `task21-${serial}`, key: expired.key, count: 1,
                lastRequest: BigInt(Date.now() - 301_000),
            } });
            await clients[0].rateLimit.update({ where: { key }, data: { lastRequest: BigInt(Date.now() - 61_000) } });
            const responses = await Promise.all(Array.from({ length: 20 }, (_, index) =>
                request(index, "/sign-in/email", ip)));
            assert.equal(responses.filter((response) => response.status === 400).length, 3);
            assert.ok(responses.every((response) => [400, 429].includes(response.status)));
            assert.equal((await clients[1].rateLimit.findUniqueOrThrow({ where: { key } })).count, 3);
            assert.equal(await clients[0].rateLimit.count({ where: { key: expired.key } }), 0);
        });
        await t.test("signup, cross-instance sessions, logout and login work with database limiting", async () => {
            const signupFixture = await fixture("/sign-up/email");
            const ip = signupFixture.ip;
            for (const path of ["/get-session", "/sign-out", "/sign-in/email"]) {
                const key = `${ip}|${path}`;
                assert.equal(await clients[0].rateLimit.count({ where: { key } }), 0);
                keys.add(key);
            }
            const password = `Synthetic-ONLY-${randomUUID()}!`;
            const signup = await request(0, "/sign-up/email", ip, {
                email, password, name: "Synthetic Task 21 auth test",
            });
            assert.equal(signup.status, 200);
            userId = (await signup.json()).user.id;
            const cookies = (response) => response.headers.getSetCookie()
                .map((value) => value.split(";")[0]).join("; ");
            const cookie = cookies(signup);
            assert.ok(cookie.length > 0);
            assert.equal((await (await request(1, "/get-session", ip, undefined, cookie)).json()).user.id, userId);
            assert.equal((await request(1, "/sign-out", ip, {}, cookie)).status, 200);
            assert.equal(await (await request(0, "/get-session", ip, undefined, cookie)).json(), null);
            const signin = await request(1, "/sign-in/email", ip, { email, password });
            assert.equal(signin.status, 200);
            const newCookie = cookies(signin);
            assert.equal((await (await request(0, "/get-session", ip, undefined, newCookie)).json()).user.id, userId);
            assert.equal((await request(0, "/sign-out", ip, {}, newCookie)).status, 200);
            assert.equal(await (await request(1, "/get-session", ip, undefined, newCookie)).json(), null);
        });
    } finally {
        try {
            // Also find a partially created fixture if an assertion failed before
            // the response provided its ID. Never delete unrelated users.
            const user = await clients[0].user.findUnique({ where: { email } });
            if (user) {
                assert.equal(user.name, "Synthetic Task 21 auth test");
                if (userId) {
                    assert.equal(user.id, userId);
                }
                await clients[0].user.delete({ where: { id: user.id, email } });
            }
            assert.equal(await clients[0].user.count({ where: { email } }), 0);
            await clients[0].rateLimit.deleteMany({ where: { key: { in: [...keys] } } });
            assert.equal(await clients[0].rateLimit.count({ where: { key: { in: [...keys] } } }), 0);
        } finally {
            await Promise.all(clients.map((client) => client.$disconnect()));
        }
    }
});
