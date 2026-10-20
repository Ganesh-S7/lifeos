import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test from "node:test";

// Better Auth captures NODE_ENV on import. Exercise its real production
// no-trusted-ip fallback in this isolated test-file process.
process.env.NODE_ENV = "production";
delete process.env.TEST;
const { betterAuth } = await import("better-auth");
const { memoryAdapter } = await import("better-auth/adapters/memory");
const { authOptions } = await import("../src/lib/server/auth-config.ts");
const origin = "https://ip-test.example.invalid";
const environment = {
    NODE_ENV: "production",
    VERCEL: "1",
    BETTER_AUTH_URL: origin,
    BETTER_AUTH_SECRET: "Synthetic-Client-IP-Test-ONLY-Secret-0123456789",
};

function fixture() {
    const db = { user: [], account: [], session: [], verification: [], rateLimit: [] };
    const config = authOptions(environment);
    const auth = betterAuth({
        ...config,
        database: memoryAdapter(db),
        logger: { disabled: true },
    });
    return {
        db,
        async request(preferred, serial = 0) {
            const headers = new Headers({
                Origin: origin,
                "Content-Type": "application/json",
                "X-Forwarded-For": serial % 2
                    ? `192.0.2.${serial + 1}`
                    : `192.0.2.${serial + 1}, 198.51.100.1`,
                "X-Real-IP": `198.51.100.${serial + 1}`,
                "Forwarded": `for=203.0.113.${serial + 1}`,
                "X-Forwarded-Host": `forged-${serial}.invalid`,
                "X-Forwarded-Proto": "http",
                "Host": `forged-${serial}.invalid`,
            });
            if (Array.isArray(preferred)) {
                for (const value of preferred) {
                    headers.append("x-vercel-forwarded-for", value);
                }
            } else if (preferred !== undefined) {
                headers.set("x-vercel-forwarded-for", preferred);
            }
            return auth.handler(new Request(`${origin}/api/auth/sign-in/email`, {
                method: "POST",
                headers,
                body: "{}",
            }));
        },
    };
}

test("only production with the explicit Vercel marker selects the sole platform header", () => {
    const selected = authOptions(environment);
    assert.deepEqual(selected.advanced.ipAddress, {
        ipAddressHeaders: ["x-vercel-forwarded-for"],
    });
    assert.equal(selected.rateLimit.storage, "database");
    assert.equal(selected.rateLimit.enabled, true);
    assert.equal(selected.advanced.trustedProxyHeaders, false);
    for (const VERCEL of [undefined, "", "0", "true"]) {
        assert.deepEqual(authOptions({ ...environment, VERCEL }).advanced.ipAddress.ipAddressHeaders, []);
    }
    const local = authOptions({
        ...environment,
        NODE_ENV: "development",
        BETTER_AUTH_URL: "http://localhost:3000",
    });
    assert.deepEqual(local.advanced.ipAddress.ipAddressHeaders, []);
    assert.equal(local.rateLimit.enabled, false);
    assert.equal(local.advanced.useSecureCookies, false);
});

test("the platform header selects the bucket; rotating alternative headers cannot change it", async () => {
    const { db, request } = fixture();
    // Synthetic Requests cannot establish that Vercel owns this header.
    for (let index = 0; index < 5; index++) {
        assert.equal((await request("192.0.2.100", index)).status, index < 3 ? 400 : 429);
    }
    assert.equal(db.rateLimit.length, 1);
    assert.equal(db.rateLimit[0].count, 3);
    assert.equal((await request("192.0.2.101", 6)).status, 400);
    assert.equal(db.rateLimit.length, 2);
});

test("missing, malformed and multi-value preferred headers share the production fallback", async () => {
    const { db, request } = fixture();
    const values = [
        undefined,
        "",
        "not-an-ip",
        "192.0.2.100, 192.0.2.101",
        "192.0.2.100:3000",
        "for=192.0.2.100",
        ["192.0.2.100", "192.0.2.101"],
        "192.0.2.100, invalid",
        ", ,",
    ];
    for (const [index, value] of values.entries()) {
        const response = await request(value, index);
        assert.equal(response.status, index < 3 ? 400 : 429);
    }
    assert.equal(db.rateLimit.length, 1);
    assert.equal(db.rateLimit[0].key, "no-trusted-ip|/sign-in/email");
    assert.equal(db.rateLimit[0].count, 3);
});

test("installed parsing trims and drops empty comma tokens around one valid address", async () => {
    const { db, request } = fixture();
    for (const [index, value] of [
        "192.0.2.100",
        " 192.0.2.100 ",
        ", 192.0.2.100, ,",
        "192.0.2.100",
    ].entries()) {
        assert.equal((await request(value, index)).status, index < 3 ? 400 : 429);
    }
    assert.equal(db.rateLimit.length, 1);
    assert.equal(db.rateLimit[0].count, 3);
});

test("native IPv6 subnet normalization remains in effect", async () => {
    const { db, request } = fixture();
    for (let index = 0; index < 4; index++) {
        assert.equal((await request(`2001:db8:1234:5678::${index + 1}`)).status,
            index < 3 ? 400 : 429);
    }
    assert.equal(db.rateLimit.length, 1);
    assert.equal((await request("2001:db8:1234:5679::1")).status, 400);
});
