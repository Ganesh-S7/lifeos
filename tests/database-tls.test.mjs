import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import * as tls from "node:tls";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { databaseAdapterOptions } from "../src/lib/server/database-config.ts";

// Synthetic connection details, never used to open a connection.
const databaseUrl = "mysql://example-user:example-password@database.example.invalid:3307/example-db";
// Use an existing public Node trust anchor at runtime; commit no certificate fixture.
const certificate = tls.rootCertificates[0];
const secondCertificate = tls.rootCertificates[1];
const normalizedCertificate = `${certificate.trim()}\n`;

function options(env = {}) {
    return databaseAdapterOptions({ DATABASE_URL: databaseUrl, ...env });
}

function fingerprint(value) {
    return createHash("sha256")
        .update(Array.isArray(value) ? value.join("\n") : value)
        .digest("hex");
}

function assertVerified(config) {
    assert.equal(typeof config.ssl, "object");
    assert.equal(config.ssl.rejectUnauthorized, true);
    assert.deepEqual(Object.keys(config.ssl).sort(), ["ca", "rejectUnauthorized"]);
    assert.ok(config.ssl.ca.length > 0);
    assert.equal(config.connectionLimit, 5);
}

test("non-production defaults preserve local non-TLS behavior", () => {
    for (const NODE_ENV of [undefined, "development", "test"]) {
        assert.equal(options({ NODE_ENV }).ssl, false);
        assert.equal(options({ NODE_ENV, DATABASE_SSL_MODE: "disable" }).ssl, false);
    }
});

test("local verified TLS and production defaults use Node's default CA set", () => {
    for (const env of [
        { NODE_ENV: "development", DATABASE_SSL_MODE: "verify" },
        { NODE_ENV: "production" },
        { NODE_ENV: "production", DATABASE_SSL_MODE: "verify" },
    ]) {
        const config = options(env);
        assertVerified(config);
        assert.equal(fingerprint(config.ssl.ca), fingerprint(tls.getCACertificates("default")));
    }
});

test("production cannot disable TLS, including through connection URL query options", () => {
    assert.throws(() => options({
        NODE_ENV: "production", DATABASE_SSL_MODE: "disable",
    }), /not allowed in production/);

    assertVerified(options({
        NODE_ENV: "production",
        DATABASE_URL: `${databaseUrl}?ssl=false&rejectUnauthorized=false&checkServerIdentity=false`,
        NODE_TLS_REJECT_UNAUTHORIZED: "0",
    }));
});

test("unsupported and empty TLS modes fail without echoing configured values", () => {
    for (const NODE_ENV of ["production", "development"]) {
        for (const mode of [
            "", "require", "true", "false", "VERIFY", "verify-ca", "verify-full", " verify",
        ]) {
            assert.throws(() => options({ NODE_ENV, DATABASE_SSL_MODE: mode }), {
                message: "DATABASE_SSL_MODE must be exactly disable or verify.",
            });
        }
    }
});

test("valid custom CA certificates normalize real and escaped newlines", () => {
    for (const ca of [
        certificate,
        certificate.replace(/\n/g, "\r\n"),
        certificate.replace(/\n/g, "\\n"),
        certificate.replace(/\n/g, "\\r\\n"),
    ]) {
        for (const NODE_ENV of ["production", "development"]) {
            const config = options({ NODE_ENV, DATABASE_SSL_MODE: "verify", DATABASE_SSL_CA: ca });
            assertVerified(config);
            assert.equal(fingerprint(config.ssl.ca), fingerprint(normalizedCertificate));
        }
    }
});

test("certificate bundles pass every complete X.509 certificate to the connector", () => {
    const bundle = `${certificate.trim()}\n\n${secondCertificate.trim()}`;
    const config = options({ NODE_ENV: "production", DATABASE_SSL_CA: bundle });
    assertVerified(config);
    assert.equal(
        fingerprint(config.ssl.ca),
        fingerprint(`${certificate.trim()}\n${secondCertificate.trim()}\n`),
    );
});

test("empty, malformed and mixed-content certificates fail without exposing PEM or OpenSSL errors", () => {
    for (const ca of [
        "", "  ", "SYNTHETIC_NOT_A_CERTIFICATE", "/path/to/ca.pem",
        "-----BEGIN CERTIFICATE-----\nU1lOVEhFVElD\n-----END CERTIFICATE-----",
        `${certificate}\nSYNTHETIC_PRIVATE_CONTENT`,
        `${certificate}\n-----BEGIN PRIVATE KEY-----\nSYNTHETIC\n-----END PRIVATE KEY-----`,
        `${certificate}\n-----BEGIN CERTIFICATE-----\nSYNTHETIC\n-----END CERTIFICATE-----`,
    ]) {
        assert.throws(() => options({ NODE_ENV: "production", DATABASE_SSL_CA: ca }), {
            message: "DATABASE_SSL_CA must contain only valid PEM X.509 certificates.",
        });
    }
});

test("a supplied CA is never silently ignored when local TLS is disabled", () => {
    for (const DATABASE_SSL_MODE of [undefined, "disable"]) {
        assert.throws(() => options({ DATABASE_SSL_MODE, DATABASE_SSL_CA: certificate }), {
            message: "DATABASE_SSL_CA requires DATABASE_SSL_MODE=verify outside production.",
        });
    }
});

test("TLS options retain the connector's default hostname verification", () => {
    const config = options({ NODE_ENV: "production" });
    assertVerified(config);
    assert.equal(config.host, "database.example.invalid");
    assert.equal(Object.hasOwn(config.ssl, "servername"), false);
    assert.equal(Object.hasOwn(config.ssl, "checkServerIdentity"), false);

    const peer = { subjectaltname: "DNS:database.example.invalid" };
    assert.equal(tls.checkServerIdentity(config.host, peer), undefined);
    assert.equal(
        tls.checkServerIdentity("different.example.invalid", peer).code,
        "ERR_TLS_CERT_ALTNAME_INVALID",
    );
});

test("the installed adapter accepts the real options without connecting", () => {
    const factory = new PrismaMariaDb(options({ NODE_ENV: "production" }));
    assert.equal(factory.provider, "mysql");
    assert.equal(typeof factory.connect, "function");
    // connect() is deliberately not called: it creates a pool and queries the server.
});

const prismaUrl = new URL("../src/lib/prisma.ts", import.meta.url).href;
const stateKey = "lifeos.database-tls-tests";
const captured = { adapters: [], clients: [], connections: 0 };
globalThis[Symbol.for(stateKey)] = captured;

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (context.parentURL?.split("?")[0] === prismaUrl) {
            let source;
            if (specifier === "dotenv/config") {
                source = "export {};";
            } else if (specifier === "@prisma/adapter-mariadb") {
                source = `export class PrismaMariaDb {
                    constructor(options) {
                        globalThis[Symbol.for(${JSON.stringify(stateKey)})].adapters.push(options);
                    }
                    connect() {
                        globalThis[Symbol.for(${JSON.stringify(stateKey)})].connections++;
                        throw new Error("Initialization must not connect");
                    }
                }`;
            } else if (specifier === "../generated/prisma/client") {
                source = `export class PrismaClient {
                    constructor(options) {
                        globalThis[Symbol.for(${JSON.stringify(stateKey)})].clients.push(options);
                    }
                    $connect() {
                        globalThis[Symbol.for(${JSON.stringify(stateKey)})].connections++;
                        throw new Error("Initialization must not connect");
                    }
                }`;
            }
            if (source) {
                return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
            }
        }
        return nextResolve(specifier, context);
    },
});

test("the Prisma singleton passes TLS settings to the adapter without connecting", async () => {
    const keys = ["NODE_ENV", "DATABASE_URL", "DATABASE_SSL_MODE", "DATABASE_SSL_CA"];
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    const previousClient = globalThis.prisma;

    try {
        delete globalThis.prisma;
        process.env.DATABASE_URL = databaseUrl;
        delete process.env.DATABASE_SSL_MODE;
        delete process.env.DATABASE_SSL_CA;

        process.env.NODE_ENV = "development";
        await import(`${prismaUrl}?tls-test=local`);
        assert.equal(captured.adapters.at(-1).ssl, false);

        // A production process starts without the development hot-reload cache.
        delete globalThis.prisma;
        process.env.NODE_ENV = "production";
        await import(`${prismaUrl}?tls-test=production`);
        assertVerified(captured.adapters.at(-1));

        process.env.DATABASE_SSL_CA = certificate.replace(/\n/g, "\\n");
        await import(`${prismaUrl}?tls-test=custom-ca`);
        assert.equal(fingerprint(captured.adapters.at(-1).ssl.ca), fingerprint(normalizedCertificate));

        process.env.DATABASE_SSL_MODE = "disable";
        await assert.rejects(import(`${prismaUrl}?tls-test=invalid`), /not allowed in production/);
        assert.equal(captured.adapters.length, 3);
        assert.equal(captured.clients.length, 3);
        assert.equal(captured.connections, 0);
    } finally {
        for (const key of keys) {
            if (previous[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = previous[key];
            }
        }
        if (previousClient === undefined) {
            delete globalThis.prisma;
        } else {
            globalThis.prisma = previousClient;
        }
    }
});

test("Prisma generation succeeds with no database URL and invalid runtime-only TLS variables", () => {
    const env = {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_SSL_MODE: "SYNTHETIC_UNSUPPORTED_MODE",
        DATABASE_SSL_CA: "SYNTHETIC_INVALID_CA",
        DOTENV_CONFIG_PATH: "__tls_test_no_environment_file__",
        CHECKPOINT_DISABLE: "1",
    };
    for (const key of ["DATABASE_URL", "SHADOW_DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"]) {
        delete env[key];
    }
    const result = spawnSync(process.execPath, [
        fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url)),
        "generate", "--config", "prisma7.config.ts",
    ], {
        cwd: fileURLToPath(new URL("../", import.meta.url)),
        env,
        encoding: "utf8",
        timeout: 30000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Generated Prisma Client/);
});
