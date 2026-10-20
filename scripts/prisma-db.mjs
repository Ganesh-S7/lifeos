import "dotenv/config";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { preparePrismaDatabase } from "./prisma-db-config.mjs";

/**
 * Supports fixed read-only check and noninteractive migration deploy/status. No URL,
 * config or schema override can escape the policy, and failures are never retried.
 */
export async function runPrismaDatabaseCommand(args, {
    env = process.env,
    launch = spawn,
    report = (message) => process.stdout.write(`${message}\n`),
} = {}) {
    const local = args[0] === "--local";
    const command = local ? args.slice(1) : args;
    const check = !local && command.length === 1 && command[0] === "check";
    const migration = command.length === 2 && command[0] === "migrate" &&
        ["status", "deploy"].includes(command[1]);
    if (!check && !migration) {
        report("Usage: pnpm db:cli check | pnpm db:cli [--local] migrate <status|deploy>");
        return 1;
    }
    let connection;
    try {
        connection = preparePrismaDatabase(env, local);
    } catch {
        if (check) {
            report("Prisma connection check failed (CONFIGURATION_REJECTED).");
            return 1;
        }
        report("Prisma database configuration rejected. " +
            "Check DATABASE_URL, TLS mode and CA settings; " +
            "local mode requires a non-production loopback target.");
        return 1;
    }
    let child;
    let interrupted = false;
    let errorCode;
    const failure = () => {
        if (check) {
            report(`Prisma connection check failed (${errorCode ?? "CHECK_FAILED"}).`);
            return;
        }
        const label = errorCode ? ` (${errorCode})` : "";
        report(`Prisma database command failed${label}. ` +
            "No insecure connection or automatic retry was attempted.");
    };
    const cleanup = () => connection.cleanup();
    const interrupt = () => {
        interrupted = true;
        child?.kill("SIGTERM");
        cleanup();
    };
    process.once("exit", cleanup);
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", interrupt);
    try {
        const require = createRequire(import.meta.url);
        const prismaEntry = join(dirname(require.resolve("prisma/package.json")), "build/index.js");
        const configPath = fileURLToPath(new URL("../prisma7.config.ts", import.meta.url));
        const prismaCommand = check ? ["db", "execute", "--stdin"] : command;
        const result = await new Promise((resolve, reject) => {
            child = launch(process.execPath, [prismaEntry, ...prismaCommand, "--config", configPath], {
                cwd: fileURLToPath(new URL("../", import.meta.url)),
                env: connection.env,
                windowsHide: true,
                stdio: [check ? "pipe" : "ignore", "pipe", "pipe"],
            });
            // Prisma may print datasource/error details. Consume and suppress all
            // child output instead of attempting to redact arbitrary native text.
            for (const stream of [child.stdout, child.stderr]) {
                stream?.on("data", (chunk) => {
                    // Retain only an allowlisted Prisma error label, never native
                    // diagnostics, URLs, certificates or database values.
                    const match = String(chunk).match(/\bP(?:1000|1001|1002|1003|1008|1010|1011|1012|1013|1017|3005|3009|3018)\b/);
                    if (match) {
                        errorCode = match[0];
                    }
                });
            }
            child.once("error", reject);
            child.once("close", (code) => resolve(code ?? 1));
            if (check) {
                // Fixed SQL only: no migration-table access or user-provided SQL.
                child.stdin.on("error", reject);
                child.stdin.end("SELECT 1;\n");
            }
        });
        if (interrupted || result !== 0) {
            failure();
            return interrupted ? 130 : 1;
        }
        if (check) {
            cleanup();
        }
        report(check
            ? "Prisma connection check succeeded (verified TLS; SELECT 1)."
            : `Prisma migrate ${command[1]} completed successfully.`);
        return 0;
    } catch {
        failure();
        return 1;
    } finally {
        process.removeListener("exit", cleanup);
        process.removeListener("SIGINT", interrupt);
        process.removeListener("SIGTERM", interrupt);
        try {
            cleanup();
        } catch {
            report("Prisma CLI certificate cleanup failed; remove the private temporary certificate directory before continuing.");
            process.exitCode = 1;
        }
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const result = await runPrismaDatabaseCommand(process.argv.slice(2));
        process.exitCode = process.exitCode || result;
    } catch {
        process.stderr.write("Prisma database command failed safely.\n");
        process.exitCode = 1;
    }
}
