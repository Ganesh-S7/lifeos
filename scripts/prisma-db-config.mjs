// @ts-check
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { fileURLToPath } from "node:url";

import { databaseTlsPolicy } from "../src/lib/server/database-config.ts";

/** @param {string} directory */
function protectDirectory(directory) {
    if (process.platform !== "win32") {
        return;
    }
    // chmod alone does not restrict Windows ACLs. Set an owner-only inherited
    // ACL before writing a certificate; pass arguments directly, never a shell.
    const identity = execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], {
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
    });
    const sid = identity.match(/S-1-\d+(?:-\d+)+/)?.[0];
    if (!sid) {
        throw new Error("Cannot establish private certificate-file permissions.");
    }
    execFileSync("icacls.exe", [directory, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
    });
}

/**
 * Policy only: no connection, migration or retry. Default is a hosted/production
 * operation; disabling TLS requires an explicit --local and a loopback target.
 * @param {NodeJS.ProcessEnv} environment
 * @param {boolean} local
 */
export function preparePrismaDatabase(environment, local = false) {
    const env = { ...environment };
    if (local && env.NODE_ENV === "production") {
        throw new Error("Local database mode is not allowed in production.");
    }
    const policy = databaseTlsPolicy({ ...env, NODE_ENV: local ? env.NODE_ENV : "production" });
    let url;
    try {
        url = new URL(env.DATABASE_URL ?? "");
        if (url.protocol !== "mysql:" || url.hash || !url.hostname || !url.pathname.slice(1)) {
            throw new Error();
        }
    } catch {
        throw new Error("DATABASE_URL must be a valid MySQL database URL.");
    }
    if (local && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
        throw new Error("Local database mode requires a loopback MySQL host.");
    }
    if (policy.enabled && url.searchParams.has("socket")) {
        throw new Error("Verified CLI connections require a TCP hostname, not a socket override.");
    }
    for (const key of [...url.searchParams.keys()]) {
        const lower = key.toLowerCase();
        if (["sslidentity", "sslpassword"].includes(lower)) {
            throw new Error("Client-certificate URL options are not supported by this CLI entry point.");
        }
        if (lower.startsWith("ssl") || lower.startsWith("tls") ||
            ["rejectunauthorized", "checkserveridentity"].includes(lower)) {
            url.searchParams.delete(key);
        }
    }
    /** @type {string | undefined} */
    let directory;
    const temporaryRoot = resolve(tmpdir());
    const cleanup = () => {
        if (directory) {
            const target = resolve(directory);
            if (dirname(target) !== temporaryRoot || !basename(target).startsWith("lifeos-prisma-tls-")) {
                throw new Error("Refusing to clean an unexpected certificate directory.");
            }
            rmSync(target, { recursive: true, force: true });
            directory = undefined;
        }
    };
    try {
        if (policy.enabled) {
            url.searchParams.set("sslaccept", "strict");
            // Prevent the native driver's local socket optimization bypassing TCP.
            url.searchParams.set("prefer_socket", "false");
            if (policy.ca !== undefined) {
                const repository = fileURLToPath(new URL("../", import.meta.url));
                const location = relative(repository, temporaryRoot);
                if (location === "" || (!isAbsolute(location) && location !== ".." &&
                    !location.startsWith(`..${sep}`))) {
                    throw new Error("Certificate files must be outside the repository.");
                }
                directory = mkdtempSync(join(temporaryRoot, "lifeos-prisma-tls-"));
                protectDirectory(directory);
                const certificatePath = join(directory, "ca.pem");
                writeFileSync(certificatePath, policy.ca, { mode: 0o600, flag: "wx" });
                url.searchParams.set("sslcert", certificatePath);
            }
        }
        env.NODE_ENV = local ? (env.NODE_ENV ?? "development") : "production";
        env.DATABASE_URL = url.toString();
        env.LIFEOS_PRISMA_DATABASE_URL = url.toString();
        delete env.SHADOW_DATABASE_URL;
        // No PEM content is needed by the child; the native connector reads the file.
        delete env.DATABASE_SSL_CA;
        return { env, cleanup };
    } catch {
        cleanup();
        throw new Error("Unable to prepare private Prisma CLI TLS configuration.");
    }
}
