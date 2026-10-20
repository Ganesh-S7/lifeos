import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, isAbsolute } from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawnSync } from "node:child_process";
import * as tls from "node:tls";
import { fileURLToPath } from "node:url";

import { preparePrismaDatabase } from "../scripts/prisma-db-config.mjs";
import { runPrismaDatabaseCommand } from "../scripts/prisma-db.mjs";

const databaseUrl = "mysql://synthetic-user:synthetic-password@database.example.invalid/db?connection_limit=2&connect_timeout=3&tag=a&tag=b";
const certificate = tls.rootCertificates[0];
const environment = { NODE_ENV: "production", DATABASE_URL: databaseUrl };

function prepared(env = {}, local = false) {
    return preparePrismaDatabase({ ...environment, ...env }, local);
}

test("hosted CLI defaults require native strict verification without a CA override", () => {
    const config = prepared({ NODE_ENV: "development" });
    try {
        const url = new URL(config.env.LIFEOS_PRISMA_DATABASE_URL);
        assert.equal(config.env.NODE_ENV, "production");
        assert.equal(url.searchParams.get("sslaccept"), "strict");
        assert.equal(url.searchParams.get("prefer_socket"), "false");
        assert.equal(url.searchParams.has("sslcert"), false);
        assert.equal(config.env.SHADOW_DATABASE_URL, undefined);
    } finally {
        config.cleanup();
    }
});

test("production cannot disable TLS and invalid modes/CA fail before a connection", () => {
    for (const DATABASE_SSL_MODE of ["disable", "", "invalid", "require", "VERIFY"]) {
        assert.throws(() => prepared({ DATABASE_SSL_MODE }));
    }
    for (const DATABASE_SSL_CA of ["", "SYNTHETIC_NOT_PEM", `${certificate}\nPRIVATE_SYNTHETIC_TEXT`]) {
        assert.throws(() => prepared({ DATABASE_SSL_CA }), (error) => {
            assert.equal(error.message.includes("SYNTHETIC"), false);
            assert.equal(error.message.includes("synthetic-password"), false);
            return true;
        });
    }
});

test("explicit non-production loopback mode preserves local plaintext development", () => {
    const config = prepared({
        NODE_ENV: "development",
        DATABASE_URL: "mysql://synthetic:password@localhost/db?sslaccept=accept_invalid_certs&connect_timeout=1",
        DATABASE_SSL_MODE: "disable",
    }, true);
    try {
        const url = new URL(config.env.DATABASE_URL);
        assert.equal(url.searchParams.has("sslaccept"), false);
        assert.equal(url.searchParams.get("connect_timeout"), "1");
    } finally {
        config.cleanup();
    }
    assert.throws(() => prepared({}, true), /not allowed in production/);
    assert.throws(() => prepared({ NODE_ENV: "development" }, true), /loopback/);
    assert.throws(() => prepared({
        NODE_ENV: "development", DATABASE_URL: "mysql://synthetic:password@localhost/db",
        DATABASE_SSL_CA: certificate,
    }, true), /requires DATABASE_SSL_MODE/);
});

test("valid CA bundles are normalized into private external files and cleanup is idempotent", () => {
    const ca = `${certificate.trim()}\n${tls.rootCertificates[1].trim()}\n`;
    const config = prepared({ DATABASE_SSL_CA: ca.replace(/\n/g, "\\n") });
    const path = new URL(config.env.DATABASE_URL).searchParams.get("sslcert");
    try {
        assert.ok(path);
        assert.equal(readFileSync(path, "utf8"), ca);
        const relativePath = relative(fileURLToPath(new URL("../", import.meta.url)), path);
        assert.ok(relativePath.startsWith("..") || isAbsolute(relativePath));
        assert.equal(config.env.DATABASE_SSL_CA, undefined);
        if (process.platform !== "win32") {
            assert.equal(statSync(path).mode & 0o777, 0o600);
            assert.equal(statSync(dirname(path)).mode & 0o777, 0o700);
        }
    } finally {
        config.cleanup();
    }
    assert.equal(existsSync(path), false);
    assert.equal(existsSync(dirname(path)), false);
    config.cleanup();
});

test("URL normalization preserves credentials and non-TLS query pairs; replaces all TLS overrides", () => {
    const config = prepared({
        DATABASE_URL: `${databaseUrl}&sslaccept=accept_invalid_certs&sslaccept=invalid&sslcert=old.pem&sslmode=disable&SSLACCEPT=invalid&tls=false&rejectUnauthorized=false`,
    });
    try {
        const url = new URL(config.env.DATABASE_URL);
        assert.equal(url.username, "synthetic-user");
        assert.equal(url.password, "synthetic-password");
        assert.equal(url.searchParams.get("connection_limit"), "2");
        assert.deepEqual(url.searchParams.getAll("tag"), ["a", "b"]);
        assert.deepEqual(url.searchParams.getAll("sslaccept"), ["strict"]);
        for (const name of ["sslcert", "sslmode", "SSLACCEPT", "tls", "rejectUnauthorized"]) {
            assert.equal(url.searchParams.has(name), false);
        }
    } finally {
        config.cleanup();
    }
    assert.throws(() => prepared({ DATABASE_URL: `${databaseUrl}&socket=/tmp/socket` }), /TCP hostname/);
    assert.throws(() => prepared({ DATABASE_URL: `${databaseUrl}&sslidentity=client.p12` }), /not supported/);
});

test("child success/failure/spawn-error never leaks output, never retries, and removes CA files", async () => {
    for (const outcome of [0, 1, "error", "signal"]) {
        const reports = [];
        let launches = 0;
        let path;
        const result = await runPrismaDatabaseCommand(["migrate", "status"], {
            env: { ...environment, DATABASE_SSL_CA: certificate },
            report: (message) => reports.push(message),
            launch(executable, args, options) {
                launches++;
                assert.equal(executable, process.execPath);
                assert.equal(args.includes(databaseUrl), false);
                assert.deepEqual(args.slice(1, 3), ["migrate", "status"]);
                const url = new URL(options.env.LIFEOS_PRISMA_DATABASE_URL);
                path = url.searchParams.get("sslcert");
                assert.ok(existsSync(path));
                assert.equal(url.searchParams.get("sslaccept"), "strict");
                const child = new EventEmitter();
                child.stdout = new PassThrough();
                child.stderr = new PassThrough();
                child.kill = () => {
                    queueMicrotask(() => child.emit("close", null));
                };
                queueMicrotask(() => {
                    child.stdout.write(`${databaseUrl}\n${certificate}`);
                    child.stderr.write("synthetic-password");
                    if (outcome === "signal") {
                        process.emit("SIGTERM");
                    } else if (outcome === "error") {
                        child.emit("error", new Error(`Synthetic ${databaseUrl}`));
                    } else {
                        child.emit("close", outcome);
                    }
                });
                return child;
            },
        });
        assert.equal(result, outcome === 0 ? 0 : outcome === "signal" ? 130 : 1);
        assert.equal(launches, 1);
        assert.equal(existsSync(path), false);
        assert.equal(reports.join(" ").includes("synthetic-password"), false);
        assert.equal(reports.join(" ").includes("BEGIN CERTIFICATE"), false);
    }
});

test("invalid configuration and unsupported URL/config overrides never launch Prisma", async () => {
    for (const args of [
        ["migrate", "status", "--config", "untrusted.ts"],
        ["migrate", "deploy", "--schema", "other.prisma"],
        ["db", "push"],
        ["migrate", "reset"],
    ]) {
        assert.equal(await runPrismaDatabaseCommand(args, {
            env: environment,
            launch() {
                assert.fail("Must not launch");
            },
            report() {},
        }), 1);
    }
    assert.equal(await runPrismaDatabaseCommand(["migrate", "deploy"], {
        env: { ...environment, DATABASE_SSL_MODE: "disable" },
        launch() {
            assert.fail("Must not launch");
        },
        report() {},
    }), 1);
});

test("direct production migration/status lacks a datasource and fails before connecting", () => {
    const env = { ...process.env, ...environment, DOTENV_CONFIG_PATH: "__no_cli_test_dotenv__" };
    delete env.LIFEOS_PRISMA_DATABASE_URL;
    const result = spawnSync(process.execPath, [
        fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url)),
        "migrate", "status", "--config", "prisma7.config.ts",
    ], { env, encoding: "utf8", timeout: 30000 });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    const output = result.stdout + result.stderr;
    assert.match(output, /datasource.*url|datasource\.url/is);
    assert.equal(output.includes("synthetic-password"), false);
});


test("Prisma config rejects an insecure injected internal URL before starting an engine", async () => {
    const names = ["NODE_ENV", "DATABASE_SSL_MODE", "DATABASE_SSL_CA", "LIFEOS_PRISMA_DATABASE_URL"];
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    try {
        process.env.NODE_ENV = "production";
        delete process.env.DATABASE_SSL_MODE;
        delete process.env.DATABASE_SSL_CA;
        for (const [index, query] of [
            "sslaccept=accept_invalid_certs",
            "sslaccept=strict&sslaccept=accept_invalid_certs&prefer_socket=false",
            "sslaccept=strict&prefer_socket=true",
        ].entries()) {
            process.env.LIFEOS_PRISMA_DATABASE_URL = `${databaseUrl}&${query}`;
            await assert.rejects(import(`../prisma7.config.ts?unsafe-input=${index}`),
                /Invalid Prisma CLI connection policy/);
        }
    } finally {
        for (const [name, value] of Object.entries(previous)) {
            if (value === undefined) {
                delete process.env[name];
            } else {
                process.env[name] = value;
            }
        }
    }
});
