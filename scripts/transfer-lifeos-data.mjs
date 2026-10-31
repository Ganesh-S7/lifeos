import { createRequire, registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import {
    assertPrivateExclusions, preparePrivateDirectory, readPrivateFile, repository, writePrivatePackage,
} from "./transfer-private-files.mjs";

registerHooks({
    resolve(specifier, context, nextResolve) {
        const file = specifier.startsWith("@/") ? new URL(`../src/${specifier.slice(2)}`, import.meta.url)
            : /^\.{1,2}\//.test(specifier) && context.parentURL ? new URL(specifier, context.parentURL) : null;
        if (file && !/\.[a-z]+$/i.test(specifier) && existsSync(new URL(`${file.href}.ts`))) {
            return nextResolve(`${file.href}.ts`, context);
        }
        return nextResolve(specifier, context);
    },
});

export function parseArguments(args) {
    const [command, ...flags] = args;
    if (command === "prepare" && flags.length === 0) return { command, values: new Map() };
    if (!["export", "import"].includes(command)) throw new Error("INVALID_ARGUMENTS");
    const names = new Set([
        "--environment", "--env-file", "--policy", "--package", "--source-owner-id", "--owner-email",
        ...(command === "import" ? ["--destination-owner-id", "--confirm-owner", "--confirm-sha256"] : []),
    ]);
    const switches = new Set(command === "export" ? ["--dry-run", "--write"] : ["--dry-run", "--apply", "--confirm-production-write", "--process-env"]);
    const values = new Map();
    for (let index = 0; index < flags.length; index++) {
        const flag = flags[index];
        if ((!names.has(flag) && !switches.has(flag)) || values.has(flag)) throw new Error("INVALID_ARGUMENTS");
        if (switches.has(flag)) values.set(flag, true);
        else {
            const value = flags[++index];
            if (!value || value.startsWith("--")) throw new Error("INVALID_ARGUMENTS");
            values.set(flag, value);
        }
    }
    const processEnvironment = values.has("--process-env");
    if (processEnvironment && (command !== "import" || values.get("--environment") !== "production" ||
        !values.has("--dry-run") || values.has("--apply") || values.has("--env-file") ||
        values.has("--confirm-owner") || values.has("--confirm-sha256") || values.has("--confirm-production-write"))) {
        throw new Error("PROCESS_ENV_READ_ONLY_REQUIRED");
    }
    const required = ["--environment", "--policy", "--package", "--source-owner-id", "--owner-email"];
    if (!processEnvironment) required.push("--env-file");
    if (command === "import") required.push("--destination-owner-id");
    if (required.some((key) => typeof values.get(key) !== "string") ||
        Boolean(values.get("--dry-run")) === Boolean(values.get(command === "export" ? "--write" : "--apply"))) {
        throw new Error("INVALID_ARGUMENTS");
    }
    return { command, values };
}

export async function runTransfer(args, report = (value) => console.log(JSON.stringify(value))) {
    let client;
    try {
        // Third-party debug traces can include SQL arguments/Health values.
        // Disable them before loading Prisma/driver modules, even in debug shells.
        process.env.DEBUG = "";
        const { command, values } = parseArguments(args);
        if (command === "prepare") {
            preparePrivateDirectory();
            report({ result: "PRIVATE_DIRECTORY_READY" });
            return 0;
        }
        assertPrivateExclusions();
        const { policySchema, validatePackage, requireTransfer } = await import("../src/lib/server/data-transfer/contracts.ts");
        const { verifyTarget, confirmImport, injectedProductionEnvironment } = await import("../src/lib/server/data-transfer/targets.ts");
        const { exportPackage, importPackage } = await import("../src/lib/server/data-transfer/database.ts");
        const parsedPolicy = policySchema.safeParse(JSON.parse(readPrivateFile(values.get("--policy"))));
        requireTransfer(parsedPolicy.success, "INVALID_TRANSFER_POLICY");
        const policy = parsedPolicy.data;
        requireTransfer(!values.has("--apply") || !policy.readOnly, "READ_ONLY_POLICY");
        let env;
        if (values.has("--process-env")) {
            requireTransfer(policy.readOnly, "READ_ONLY_POLICY_REQUIRED");
            requireTransfer(policy.destinations.production.length === 1, "SINGLE_PRODUCTION_DESTINATION_REQUIRED");
            env = injectedProductionEnvironment(process.env);
        } else {
            const envPath = values.get("--env-file");
            // Existing explicit-file behavior; no process/Next/dotenv fallback.
            const text = command === "export" && resolve(repository, envPath) === resolve(repository, ".env")
                ? readFileSync(resolve(repository, ".env"), "utf8") : readPrivateFile(envPath);
            env = dotenv.parse(text);
        }
        const environment = values.get("--environment");
        requireTransfer(command === "export" ? environment === "local" : ["production", "local-test"].includes(environment), "INVALID_ENVIRONMENT");
        const target = verifyTarget(env, policy, command === "export" ? "source" : "destination", environment);
        let pkg;
        if (command === "import") {
            pkg = validatePackage(JSON.parse(readPrivateFile(values.get("--package"))), policy);
            confirmImport(pkg, {
                sourceOwnerId: values.get("--source-owner-id"), destinationOwnerId: values.get("--destination-owner-id"),
                ownerEmail: values.get("--owner-email"), environment, apply: values.has("--apply"),
                confirmOwner: values.get("--confirm-owner"), confirmSHA256: values.get("--confirm-sha256"),
                confirmProductionWrite: values.get("--confirm-production-write") === true,
            });
        }
        const require = createRequire(import.meta.url);
        const { PrismaClient } = await import("../src/generated/prisma/client.ts");
        const { PrismaMariaDb } = require("@prisma/adapter-mariadb");
        client = new PrismaClient({ adapter: new PrismaMariaDb(target.options), log: [] });
        if (command === "export") {
            pkg = await exportPackage(client, policy, values.get("--source-owner-id"), values.get("--owner-email"));
            if (values.has("--write")) writePrivatePackage(values.get("--package"), pkg);
            report({
                operation: command, mode: values.has("--write") ? "write-package" : "dry-run",
                counts: pkg.manifest.counts, packageSHA256: pkg.sha256,
                healthDates: { first: pkg.records.healthLog.map((row) => row.date).sort().at(0), last: pkg.records.healthLog.map((row) => row.date).sort().at(-1) },
            });
        } else {
            const result = await importPackage(client, pkg, policy, target.endpoint.database,
                values.get("--destination-owner-id"), values.get("--owner-email"), values.has("--dry-run"));
            report({ operation: command, mode: values.has("--dry-run") ? "dry-run" : "apply", ...result });
            if (result.conflicts.length) return 2;
        }
        return 0;
    } catch (error) {
        const { TransferError } = await import("../src/lib/server/data-transfer/contracts.ts");
        const fileCodes = new Set([
            "INVALID_ARGUMENTS", "PROCESS_ENV_READ_ONLY_REQUIRED", "PRIVATE_ARTIFACT_PATH_REQUIRED", "PRIVATE_ARTIFACT_EXCLUSION_REQUIRED",
            "TRACKED_TRANSFER_ARTIFACTS", "PRIVATE_PERMISSIONS_REQUIRED", "INVALID_ARTIFACT_SIZE",
        ]);
        const code = error instanceof TransferError ? error.code : fileCodes.has(error.message) ? error.message
            : ["P2002", "P2034"].includes(error.code) ? "CONCURRENT_TRANSFER_CONFLICT"
                : ["P2021", "P2022"].includes(error.code) ? "INCOMPATIBLE_SCHEMA" : "TRANSFER_FAILED";
        report({ result: "failed", code, ...(error instanceof TransferError && error.report ? { ...error.report, applied: false } : {}) });
        return 1;
    } finally {
        try { await client?.$disconnect(); } catch {
            report({ result: "connection-close-failed", code: "DISCONNECT_FAILED" });
        }
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exitCode = await runTransfer(process.argv.slice(2));
}
