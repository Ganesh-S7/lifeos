import dotenv from "dotenv";
import { createRequire, registerHooks } from "node:module";
import { existsSync } from "node:fs";

// Run TS service code with the project's Node 22 runtime, without another runner.
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (/^\.{1,2}\//.test(specifier) && context.parentURL && !/\.[a-z]+$/i.test(specifier)) {
            const path = new URL(`${specifier}.ts`, context.parentURL);
            if (existsSync(path)) return nextResolve(path.href, context);
        }
        if (specifier === "@/lib/utils/date") return nextResolve(new URL("../src/lib/utils/date.ts", import.meta.url).href, context);
        return nextResolve(specifier, context);
    },
});

const originalEnvironment = { ...process.env };
dotenv.config({ quiet: true });
let client;
try {
    const args = process.argv.slice(2);
    const allowed = new Set(["--owner-id", "--part", "--dry-run", "--apply"]);
    const values = new Map();
    for (let index = 0; index < args.length; index++) {
        const flag = args[index];
        if (!allowed.has(flag) || values.has(flag)) throw new Error("INVALID_ARGUMENTS");
        values.set(flag, flag === "--owner-id" || flag === "--part" ? args[++index] : true);
    }
    const userId = values.get("--owner-id");
    const part = values.get("--part");
    if (typeof userId !== "string" || !userId.trim() || !["history", "plan", "all"].includes(part) ||
        Boolean(values.get("--dry-run")) === Boolean(values.get("--apply"))) throw new Error("INVALID_ARGUMENTS");
    const { readHistoricalSource, importMonthlyHistory } = await import("../src/features/finance/monthly/server/historical-import.ts");
    // Detailed reconciliation failures contain source amounts only, never DB diagnostics.
    let source;
    try { source = readHistoricalSource(); } catch (error) {
        console.error(`Source reconciliation failed: ${error.message}`);
        process.exitCode = 1;
    }
    if (source) {
        const cliUrl = new URL(process.env.DATABASE_URL ?? "invalid:");
        const local = (url) => url.protocol === "mysql:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname === "/lifeos";
        if (!local(cliUrl) || process.env.NODE_ENV === "production") throw new Error("LOCAL_TARGET_REQUIRED");
        // Compare the normal CLI dotenv resolution with Next's runtime precedence.
        const environment = { ...process.env };
        process.env = { ...originalEnvironment };
        const require = createRequire(import.meta.resolve("next"));
        require("@next/env").loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
        const runtimeUrl = new URL(process.env.DATABASE_URL ?? "invalid:");
        if (!local(runtimeUrl) || runtimeUrl.href !== cliUrl.href) throw new Error("CLI_RUNTIME_TARGET_MISMATCH");
        process.env = environment;
        const { PrismaClient } = await import("../src/generated/prisma/client.ts");
        const { PrismaMariaDb } = await import("@prisma/adapter-mariadb");
        const { databaseAdapterOptions } = await import("../src/lib/server/database-config.ts");
        client = new PrismaClient({ adapter: new PrismaMariaDb(databaseAdapterOptions()) });
        const [database] = await client.$queryRawUnsafe("SELECT DATABASE() AS name");
        if (database.name !== "lifeos") throw new Error("LOCAL_TARGET_REQUIRED");
        const report = await importMonthlyHistory(client, userId, { dryRun: Boolean(values.get("--dry-run")), part }, source);
        console.log(JSON.stringify({ mode: values.has("--dry-run") ? "dry-run" : "apply", target: "local development lifeos", ownerId: userId, ...report }));
    }
} catch (error) {
    const safe = new Set(["INVALID_ARGUMENTS", "LOCAL_TARGET_REQUIRED", "CLI_RUNTIME_TARGET_MISMATCH"]);
    console.error(`Monthly import failed (${safe.has(error.message) ? error.message : "IMPORT_FAILED"}). No automatic retry was attempted.`);
    process.exitCode = 1;
} finally {
    await client?.$disconnect();
}
