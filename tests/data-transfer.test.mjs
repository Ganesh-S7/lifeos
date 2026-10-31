import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import * as tls from "node:tls";
import { contracts, fixture, replacementFixture, owner, destinationId, emptyDestination, resign, models, time } from "./helpers/transfer-fixtures.mjs";
const { executePlan, mappedId, planTransfer, verifyOwner } = await import("../src/lib/server/data-transfer/plan.ts");
const { verifyTarget, confirmImport, injectedProductionEnvironment, assertImportPolicy } = await import("../src/lib/server/data-transfer/targets.ts");
const { parseArguments, runTransfer } = await import("../scripts/transfer-lifeos-data.mjs");
const { verifySchema, createTransferredRecord, replaceHealthTargets, importPackage } = await import("../src/lib/server/data-transfer/database.ts");
const { privatePath } = await import("../scripts/transfer-private-files.mjs");

test("explicit email/ID mapping rejects missing, wrong and ambiguous owners", () => {
    assert.deepEqual(verifyOwner([owner], owner.id, " OWNER@example.invalid "), owner);
    for (const [matches, id, email] of [
        [[], owner.id, owner.email], [[owner], "other", owner.email],
        [[owner], owner.id, "other@example.invalid"], [[owner, { ...owner, id: "duplicate" }], owner.id, owner.email],
    ]) assert.throws(() => verifyOwner(matches, id, email), /OWNER_MAPPING_REJECTED/);
});

test("package contains complete approved Health/Finance data with exact nullable Decimal/date/timestamp fields", () => {
    const { pkg, policy } = fixture();
    assert.equal(pkg.records.healthLog.length, 17);
    assert.equal(pkg.records.healthLog.filter((row) => row.weightKg !== null).length, 11);
    assert.equal(pkg.records.healthTargets.length, 1);
    assert.equal(pkg.records.monthlyFinanceSnapshot.length, 11);
    assert.equal(pkg.records.financeSpendingPlan[0].targets.length, 15);
    assert.equal(pkg.records.healthLog[0].proteinGrams, "90.01");
    assert.equal(pkg.records.healthLog[0].carbsGrams, null);
    assert.equal(pkg.records.healthLog[0].steps, 0);
    assert.equal(pkg.records.healthLog[0].date, "2026-10-13");
    assert.equal(pkg.records.healthLog[0].createdAt, time);
    assert.deepEqual(Object.keys(pkg.records).sort(), [...models].sort());
    assert.deepEqual(contracts.validatePackage(JSON.parse(JSON.stringify(pkg)), policy), pkg);
});

test("strict model allowlist rejects accounts, transactions, auth payloads and unexpected fields", () => {
    for (const field of ["bankAccount", "financeTransaction", "account", "session", "rateLimit", "liability", "investment", "positionHistory"]) {
        const { pkg, policy } = fixture();
        pkg.records[field] = [];
        assert.throws(() => contracts.validatePackage(resign(pkg), policy), /INVALID_PACKAGE/);
    }
    const { pkg, policy } = fixture();
    pkg.records.healthLog[0].secret = "must not escape";
    assert.throws(() => contracts.validatePackage(resign(pkg), policy), /INVALID_PACKAGE/);
});

test("hash, source ownership, counts, daily uniqueness and schema provenance fail closed", () => {
    const mutations = [
        [pkg => { pkg.records.healthLog[0].steps++; }, false, /INVALID_PACKAGE_HASH/],
        [pkg => { pkg.records.healthLog[0].userId = "other"; }, true, /WRONG_RECORD_OWNER/],
        [pkg => { pkg.records.healthLog.pop(); }, true, /UNEXPECTED_COUNTS/],
        [pkg => { pkg.records.healthLog[1].date = pkg.records.healthLog[0].date; }, true, /DUPLICATE_SOURCE_RECORD/],
        [pkg => { pkg.manifest.schema.sha256 = "0".repeat(64); }, true, /SOURCE_SCHEMA_MISMATCH/],
        [pkg => { pkg.manifest.source.fingerprint = "0".repeat(64); }, true, /SOURCE_TARGET_MISMATCH/],
        [pkg => { pkg.records.healthLog[0].weightKg = "70.251"; }, true, /INVALID_PACKAGE/],
        [pkg => { pkg.records.healthLog[0].date = "2026-02-30"; }, true, /INVALID_PACKAGE/],
        [pkg => { pkg.records.expenseCategory[0].name += " "; }, false, /NON_CANONICAL_PACKAGE/],
    ];
    for (const [mutate, rehash, error] of mutations) {
        const { pkg, policy } = fixture();
        mutate(pkg);
        assert.throws(() => contracts.validatePackage(rehash ? resign(pkg) : pkg, policy), error);
    }
});

test("all monthly values reconcile against the existing source and IDEAL cannot be changed", () => {
    for (const mutate of [
        pkg => { pkg.records.monthlyFinanceSnapshot[0].total = "1.00"; },
        pkg => { pkg.records.monthlyFinanceSnapshot[1].left = "1.00"; },
        pkg => { pkg.records.monthlyFinanceSnapshot[2].categories[0].amount = "1.00"; },
        pkg => { pkg.records.financeSpendingPlan[0].targets[0].amount = "1.00"; },
        pkg => { pkg.records.financeSpendingPlan[0].referenceIncome = "1.00"; },
    ]) {
        const { pkg, policy } = fixture();
        mutate(pkg);
        assert.throws(() => contracts.validatePackage(resign(pkg), policy), /RECONCILIATION_FAILED/);
    }
});

test("categories are owned, normalized, useful custom definitions; mock-only and built-in rows cannot slip in", () => {
    for (const [mutate, error] of [
        [pkg => { pkg.records.expenseCategory[0].userId = "other"; }, /WRONG_RECORD_OWNER/],
        [pkg => { pkg.records.expenseCategory[0].normalizedName = "wrong"; }, /INVALID_PACKAGE/],
        [pkg => { Object.assign(pkg.records.expenseCategory[0], { name: "Mock-only", normalizedName: "mock-only" }); }, /CATEGORY_NOT_APPROVED/],
        [pkg => { Object.assign(pkg.records.expenseCategory[0], { name: "Food", normalizedName: "food" }); }, /CATEGORY_NOT_APPROVED/],
    ]) {
        const { pkg, policy } = fixture();
        mutate(pkg);
        assert.throws(() => contracts.validatePackage(resign(pkg), policy), error);
    }
    const { pkg } = fixture();
    const destination = emptyDestination();
    destination.records.expenseCategory.push({ ...pkg.records.expenseCategory[0], id: "existing", userId: destinationId, name: "  RENT  " });
    const plan = planTransfer(pkg, destinationId, destination);
    assert.equal(plan.counts.expenseCategory.skip, 1);
    assert.equal(plan.mappings.find(row => row.sourceId === pkg.records.expenseCategory[0].id).destinationId, "existing");
});

test("stable IDs differ across owners/models, preserve metadata and support idempotent repeated imports", async () => {
    const { pkg } = fixture();
    const destination = emptyDestination();
    const original = structuredClone(pkg);
    const plan = planTransfer(pkg, destinationId, destination);
    const id = mappedId(pkg, destinationId, "healthLog", "log-0");
    assert.equal(id, mappedId({ ...pkg, manifest: { ...pkg.manifest, exportedAt: "2026-10-31T00:00:00.000Z" } }, destinationId, "healthLog", "log-0"));
    assert.notEqual(id, mappedId(pkg, "other", "healthLog", "log-0"));
    assert.notEqual(id, mappedId(pkg, destinationId, "healthTargets", "log-0"));
    assert.ok(id.length <= 191);
    const writer = { async create(action) {
        assert.equal(action.record.userId, destinationId);
        destination.records[action.model].push(structuredClone(action.record));
        if ("id" in action.record) destination.identifiers.push({ model: action.model, id: action.record.id, userId: destinationId });
    } };
    await executePlan(plan, writer, false);
    assert.deepEqual(pkg, original, "source package is never mutated");
    assert.equal(destination.records.healthLog[0].createdAt, time);
    assert.equal(destination.records.healthTargets[0].updatedAt, time);
    const again = planTransfer(pkg, destinationId, destination);
    assert.equal(again.creates.length, 0);
    for (const model of models) assert.equal(again.counts[model].skip, pkg.records[model].length);
    await executePlan(again, { create() { assert.fail("idempotent rerun wrote data"); } }, false);
});

test("same-date, target, plan, snapshot and global ID conflicts prevent every apply write", async () => {
    for (const model of models.filter(model => model !== "expenseCategory")) {
        const { pkg } = fixture();
        const destination = emptyDestination();
        const existing = structuredClone(pkg.records[model][0]);
        existing.userId = destinationId;
        if ("id" in existing) existing.id = "existing";
        if (model === "healthLog") existing.steps++;
        if (model === "healthTargets") existing.stepsPerDay++;
        if (model === "monthlyFinanceSnapshot") existing.total = "1.00";
        if (model === "financeSpendingPlan") existing.targets[0].amount = "1.00";
        destination.records[model].push(existing);
        const plan = planTransfer(pkg, destinationId, destination);
        assert.equal(plan.counts[model].conflict, 1);
        await assert.rejects(executePlan(plan, { create() { assert.fail("conflict wrote data"); } }, false), /UNRESOLVED_CONFLICTS/);
    }
    const { pkg } = fixture();
    const destination = emptyDestination();
    destination.identifiers.push({ model: "healthLog", id: mappedId(pkg, destinationId, "healthLog", "log-0"), userId: "unrelated" });
    const report = planTransfer(pkg, destinationId, destination);
    assert.equal(report.conflicts[0].code, "ID_OWNED_BY_ANOTHER_USER");
});

test("dry-run reports creates/skips/conflicts and has no mutation calls", async () => {
    const { pkg } = fixture();
    const destination = emptyDestination();
    const before = structuredClone(destination);
    const plan = planTransfer(pkg, destinationId, destination);
    const report = await executePlan(plan, { create() { assert.fail("dry-run wrote data"); } }, true);
    assert.equal(report.applied, false);
    assert.equal(report.counts.healthLog.create, 17);
    assert.equal(report.counts.healthTargets.create, 1);
    assert.deepEqual(destination, before);
});

test("Production requires exact allowlisted endpoint, remote destination and verified TLS", () => {
    const { policy } = fixture();
    const ca = tls.getCACertificates("default")[0];
    const env = { DATABASE_URL: "mysql://fixture:fixture@approved.example/production", DATABASE_SSL_MODE: "verify", DATABASE_SSL_CA: ca };
    const target = verifyTarget(env, policy, "destination", "production");
    assert.equal(target.options.ssl.rejectUnauthorized, true);
    assert.equal(target.options.connectTimeout, 10_000);
    assert.equal(target.options.connectionLimit, 5);
    for (const bad of [
        { ...env, DATABASE_SSL_MODE: "disable" }, { ...env, DATABASE_SSL_CA: undefined },
        { ...env, DATABASE_URL: "mysql://fixture:fixture@unapproved.example/production" },
        { ...env, DATABASE_URL: "mysql://fixture:fixture@approved.example/wrong" },
        { ...env, DATABASE_URL: "mysql://fixture:fixture@approved.example:3307/production" },
        { ...env, DATABASE_URL: "mysql://fixture:fixture@approved.example/production?sslaccept=accept_invalid_certs" },
    ]) assert.throws(() => verifyTarget(bad, policy, "destination", "production"));
    const localPolicy = { ...policy, destinations: { ...policy.destinations, production: [policy.source] } };
    assert.throws(() => verifyTarget({ ...env, DATABASE_URL: "mysql://fixture:fixture@127.0.0.1/lifeos" }, localPolicy, "destination", "production"), /PRODUCTION_TLS_REQUIRED/);
    for (const host of ["localhost.", "test.localhost", "127.0.0.2", "[::1]", "[::ffff:7f00:1]"]) {
        const blocked = { ...policy, destinations: {
            ...policy.destinations, production: [{ host, port: 3306, database: "production" }],
        } };
        assert.throws(() => verifyTarget({ ...env, DATABASE_URL: `mysql://fixture:fixture@${host}/production` }, blocked, "destination", "production"), /PRODUCTION_TLS_REQUIRED/);
    }
    assert.throws(() => verifyTarget(env, policy, "source", "local"), /SOURCE_TARGET_REJECTED/);
});

test("CLI rejects missing/ambiguous modes and redacts failures; artifacts excluded from both upload paths", async () => {
    assert.throws(() => parseArguments(["import", "--apply"]), /INVALID_ARGUMENTS/);
    assert.throws(() => parseArguments(["export", "--dry-run", "--dry-run"]), /INVALID_ARGUMENTS/);
    const output = [];
    assert.equal(await runTransfer(["invalid", "mysql://secret:password@host/db"], value => output.push(value)), 1);
    assert.deepEqual(output, [{ result: "failed", code: "INVALID_ARGUMENTS" }]);
    for (const file of [".gitignore", ".vercelignore"]) {
        assert.ok(readFileSync(new URL(`../${file}`, import.meta.url), "utf8").split(/\r?\n/).includes("/.lifeos-transfer/"));
    }
});

test("apply requires the reviewed digest, both explicit owners, matching identity and Production confirmation", () => {
    const { pkg } = fixture();
    const input = {
        sourceOwnerId: owner.id, destinationOwnerId: destinationId, ownerEmail: owner.email,
        environment: "production", apply: true, confirmOwner: destinationId,
        confirmSHA256: pkg.sha256, confirmProductionWrite: true,
    };
    confirmImport(pkg, input);
    for (const change of [
        { sourceOwnerId: "wrong" }, { ownerEmail: "wrong@example.invalid" },
        { destinationOwnerId: "" }, { confirmOwner: undefined }, { confirmSHA256: "0".repeat(64) },
        { confirmProductionWrite: false },
    ]) assert.throws(() => confirmImport(pkg, { ...input, ...change }));
    confirmImport(pkg, { ...input, apply: false, confirmOwner: undefined, confirmSHA256: undefined, confirmProductionWrite: false });
});

test("same-date metadata differences are conflicts, while exact existing values are skipped without ID reuse", () => {
    const { pkg } = fixture();
    const destination = emptyDestination();
    const row = { ...pkg.records.healthLog[0], id: "already-present", userId: destinationId };
    destination.records.healthLog.push(row);
    assert.equal(planTransfer(pkg, destinationId, destination).counts.healthLog.skip, 1);
    row.updatedAt = "2026-10-31T00:00:00.000Z";
    assert.equal(planTransfer(pkg, destinationId, destination).counts.healthLog.conflict, 1);
    row.userId = "unrelated";
    assert.throws(() => planTransfer(pkg, destinationId, destination), /DESTINATION_RECORD_OWNER_MISMATCH/);
});

test("destination schema preflight rejects missing migrations/columns using SELECTs only", async () => {
    const calls = [];
    const client = { async $queryRaw(strings) {
        calls.push(strings.join("?"));
        if (calls.length === 1) return [{ name: "production" }];
        if (calls.length === 2) return contracts.requiredMigrations.map(migration_name => ({
            migration_name, finished_at: new Date(time), rolled_back_at: null,
        }));
        return [];
    } };
    await assert.rejects(verifySchema(client, "production"), /INCOMPATIBLE_SCHEMA/);
    assert.ok(calls.every(sql => /^\s*SELECT\b/i.test(sql)));
    assert.equal(calls.length, 3);
    await assert.rejects(verifySchema({ async $queryRaw(strings) {
        return strings.join("").includes("DATABASE()") ? [{ name: "production" }] : [];
    } }, "production"), /REQUIRED_MIGRATIONS_MISSING/);
    await assert.rejects(verifySchema({ async $queryRaw() { return [{ name: "wrong" }]; } }, "production"), /CONNECTED_DATABASE_MISMATCH/);
});

test("write boundary has no ledger/auth path and private files cannot escape their ignored directory", async () => {
    for (const model of ["bankAccount", "financeTransaction", "user", "session", "rateLimit"]) {
        await assert.rejects(createTransferredRecord({}, { model, record: {} }), /UNAPPROVED_MODEL/);
    }
    for (const path of [".env", "../outside.json", "src/package.json", ".lifeos-transfer/../public/data.json"]) {
        assert.throws(() => privatePath(path), /PRIVATE_ARTIFACT_PATH_REQUIRED/);
    }
});

test("process-environment mode separates dry-run and explicitly confirmed Production apply", () => {
    const args = [
        "import", "--environment", "production", "--policy", ".lifeos-transfer/reviewed.json",
        "--package", ".lifeos-transfer/package.json", "--source-owner-id", owner.id,
        "--destination-owner-id", destinationId, "--owner-email", owner.email,
        "--process-env", "--dry-run",
    ];
    assert.equal(parseArguments(args).values.get("--process-env"), true);
    assert.throws(() => parseArguments([...args, "--env-file", ".env"]), /PROCESS_ENV_PRODUCTION_IMPORT_REQUIRED/);
    for (const extra of [
        ["--confirm-production-write"], ["--confirm-owner", destinationId],
        ["--confirm-sha256", "0".repeat(64)],
    ]) assert.throws(() => parseArguments([...args, ...extra]), /PROCESS_ENV_DRY_RUN_CONFIRMATIONS_REJECTED/);
    const apply = [
        ...args.slice(0, -1), "--apply", "--confirm-owner", destinationId,
        "--confirm-sha256", "0".repeat(64), "--confirm-production-write",
    ];
    assert.equal(parseArguments(apply).values.get("--apply"), true);
    assert.throws(() => parseArguments([...apply, "--dry-run"]), /PROCESS_ENV_DRY_RUN_CONFIRMATIONS_REJECTED/);
    assert.throws(() => parseArguments([...args.slice(0, -1), "--apply"]), /WRITE_CONFIRMATION_REQUIRED/);
    const testMode = [...args];
    testMode[2] = "local-test";
    assert.throws(() => parseArguments(testMode), /PROCESS_ENV_PRODUCTION_IMPORT_REQUIRED/);
    assert.throws(() => parseArguments(["export", ...args.slice(1)]), /INVALID_ARGUMENTS/);
});

test("injected environment copies only Production database settings without file fallback or mutation", () => {
    const input = {
        DATABASE_URL: "mysql://fixture:fixture@approved.example/production",
        DATABASE_SSL_MODE: "verify", DATABASE_SSL_CA: "fixture CA", VERCEL_ENV: "production",
        NODE_ENV: "development", AUTH_SECRET: "not copied", DOTENV_CONFIG_PATH: ".env",
    };
    const before = structuredClone(input);
    assert.deepEqual(injectedProductionEnvironment(input), {
        DATABASE_URL: input.DATABASE_URL, DATABASE_SSL_MODE: "verify", DATABASE_SSL_CA: input.DATABASE_SSL_CA,
        NODE_ENV: "production",
    });
    assert.deepEqual(input, before);
    // Missing injected data cannot be supplied by an unrelated/default local file.
    assert.throws(() => injectedProductionEnvironment({ DOTENV_CONFIG_PATH: ".env" }), /MISSING_PRODUCTION_ENVIRONMENT/);
});

test("injected placeholders, wrong environment, missing settings and disabled TLS are rejected without leaking values", () => {
    const valid = { DATABASE_URL: "mysql://fixture:fixture@approved.example/production", DATABASE_SSL_MODE: "verify", DATABASE_SSL_CA: "fixture CA" };
    for (const key of ["DATABASE_URL", "DATABASE_SSL_MODE", "DATABASE_SSL_CA"]) {
        for (const value of ["[SENSITIVE]", "[REDACTED]", "[ENCRYPTED]", "***", "<placeholder>", "CHANGE_ME"]) {
            assert.throws(() => injectedProductionEnvironment({ ...valid, [key]: value }), /PLACEHOLDER_PRODUCTION_ENVIRONMENT/);
        }
        assert.throws(() => injectedProductionEnvironment({ ...valid, [key]: undefined }), /MISSING_PRODUCTION_ENVIRONMENT/);
    }
    assert.throws(() => injectedProductionEnvironment({ ...valid, DATABASE_SSL_MODE: "disable" }), /PRODUCTION_TLS_REQUIRED/);
    assert.throws(() => injectedProductionEnvironment({ ...valid, VERCEL_ENV: "preview" }), /WRONG_INJECTED_ENVIRONMENT/);
    const { policy } = fixture();
    assert.throws(() => verifyTarget(injectedProductionEnvironment({ ...valid, DATABASE_URL: "not a database URL" }), policy, "destination", "production"), /INVALID_DATABASE_CONFIGURATION/);
    assert.throws(() => verifyTarget(injectedProductionEnvironment({ ...valid, DATABASE_URL: "mysql://fixture:fixture@localhost/lifeos" }), policy, "destination", "production"), /DESTINATION_NOT_ALLOWLISTED/);
});

test("read-only policies block apply before any transaction; old local policies remain compatible", async () => {
    const { pkg, policy } = fixture();
    assert.equal(policy.readOnly, false);
    await assert.rejects(importPackage({ $transaction() { assert.fail("read-only policy opened a write transaction"); } },
        pkg, { ...policy, readOnly: true }, "production", destinationId, owner.email, false), /READ_ONLY_POLICY/);
    const output = [];
    const args = ["import", "--environment", "production", "--process-env", "--apply"];
    assert.equal(await runTransfer(args, value => output.push(value)), 1);
    assert.deepEqual(output, [{ result: "failed", code: "WRITE_CONFIRMATION_REQUIRED" }]);
});

test("replacement permission defaults off and accepts only a complete HealthTargets review", () => {
    const { policy } = fixture();
    assert.deepEqual(policy.healthTargetsReplacement, { enabled: false });
    assert.equal(policy.allowProductionApply, false);
    const { approval } = replacementFixture();
    for (const invalid of [
        { enabled: true },
        { ...approval, expectedSHA256: "bad" },
        { ...approval, model: "healthLog" },
        { enabled: false, recordId: "unexpected" },
    ]) {
        assert.equal(contracts.policySchema.safeParse({
            ...policy, healthTargetsReplacement: invalid,
        }).success, false);
    }
});

test("review fingerprints bind identity, all nullable fields and timestamps", () => {
    const { existing } = replacementFixture();
    const original = contracts.healthTargetsFingerprint(existing);
    for (const change of [
        { id: "different" }, { userId: "different" },
        { weightGoalKg: null }, { stepsPerDay: null }, { sleepMinutesPerDay: null },
        { waterMlPerDay: null }, { caloriesKcalPerDay: null },
        { proteinGramsPerDay: null }, { carbsGramsPerDay: null },
        { fiberGramsPerDay: null }, { updatedAt: time },
    ]) {
        assert.notEqual(contracts.healthTargetsFingerprint({ ...existing, ...change }), original);
    }
});

test("authorized target replacement is explicit in dry-run and preserves destination identity", async () => {
    const { pkg, destination, approval, existing } = replacementFixture();
    const disabled = planTransfer(pkg, destinationId, destination);
    assert.equal(disabled.counts.healthTargets.conflict, 1);
    const plan = planTransfer(pkg, destinationId, destination, approval);
    assert.deepEqual(plan.counts.healthTargets, { create: 0, replace: 1, skip: 0, conflict: 0 });
    assert.equal(plan.creates.length, 41);
    assert.equal(plan.replacements.length, 1);
    assert.equal(plan.mappings.find(row => row.model === "healthTargets").destinationId, existing.id);
    const action = plan.replacements[0];
    assert.deepEqual(action.record, {
        ...pkg.records.healthTargets[0], id: existing.id, userId: destinationId,
    });
    assert.ok(models.filter(model => model !== "healthTargets").every(model => plan.counts[model].replace === 0));
    const before = structuredClone(destination);
    const report = await executePlan(plan, {
        create() {
            assert.fail("dry-run created a record");
        },
        replaceHealthTargets() {
            assert.fail("dry-run replaced targets");
        },
    }, true);
    assert.equal(report.applied, false);
    assert.deepEqual(destination, before);
});

test("stale approvals reject changed IDs/content or a missing record; exact reruns skip", () => {
    for (const mutate of [
        destination => { destination.records.healthTargets[0].stepsPerDay++; },
        destination => { destination.records.healthTargets[0].updatedAt = time; },
        destination => { destination.records.healthTargets[0].id = "recreated"; },
        destination => { destination.records.healthTargets = []; },
    ]) {
        const { pkg, destination, approval } = replacementFixture();
        mutate(destination);
        const plan = planTransfer(pkg, destinationId, destination, approval);
        assert.equal(plan.counts.healthTargets.conflict, 1);
        assert.equal(plan.replacements.length, 0);
        assert.ok(plan.conflicts.some(row => row.code === "HEALTH_TARGETS_REVIEW_STALE"));
    }
    const { pkg, destination, approval } = replacementFixture();
    destination.records.healthTargets[0] = {
        ...pkg.records.healthTargets[0], id: approval.recordId, userId: destinationId,
    };
    const repeat = planTransfer(pkg, destinationId, destination, approval);
    assert.equal(repeat.counts.healthTargets.skip, 1);
    assert.equal(repeat.counts.healthTargets.replace, 0);
});

test("replacement cannot bypass ownership, mapped-ID collisions or target cardinality", () => {
    const { pkg, destination, approval } = replacementFixture();
    assert.throws(() => planTransfer(pkg, destinationId, destination, {
        ...approval, destinationUserId: "other",
    }), /REPLACEMENT_OWNER_MISMATCH/);
    destination.identifiers.push({
        model: "healthTargets", userId: "other",
        id: mappedId(pkg, destinationId, "healthTargets", pkg.records.healthTargets[0].id),
    });
    const collision = planTransfer(pkg, destinationId, destination, approval);
    assert.equal(collision.conflicts[0].code, "ID_OWNED_BY_ANOTHER_USER");
    assert.equal(collision.replacements.length, 0);
    destination.records.healthTargets.push({ ...destination.records.healthTargets[0], id: "duplicate" });
    assert.throws(() => planTransfer(pkg, destinationId, destination, approval), /DESTINATION_TARGETS_INVALID/);
});

test("conflicts in other models block all writes even when targets are approved", async () => {
    for (const model of ["healthLog", "monthlyFinanceSnapshot", "financeSpendingPlan"]) {
        const { pkg, destination, approval } = replacementFixture();
        const row = structuredClone(pkg.records[model][0]);
        row.userId = destinationId;
        if ("id" in row) row.id = "existing";
        if (model === "healthLog") row.steps++;
        if (model === "monthlyFinanceSnapshot") row.total = "1.00";
        if (model === "financeSpendingPlan") row.targets[0].amount = "1.00";
        destination.records[model].push(row);
        const plan = planTransfer(pkg, destinationId, destination, approval);
        assert.equal(plan.counts[model].conflict, 1);
        await assert.rejects(executePlan(plan, {
            create() {
                assert.fail("conflicting plan created data");
            },
            replaceHealthTargets() {
                assert.fail("conflicting plan replaced data");
            },
        }, false), /UNRESOLVED_CONFLICTS/);
    }
});

function databaseTargets(record) {
    const row = { ...record, updatedAt: new Date(record.updatedAt) };
    for (const field of ["weightGoalKg", "proteinGramsPerDay", "carbsGramsPerDay", "fiberGramsPerDay"]) {
        row[field] = record[field] === null ? null : { toFixed: () => record[field] };
    }
    return row;
}

test("dedicated writer copies every value including NULL and timestamp, never identity", async () => {
    const { pkg, destination, approval, existing } = replacementFixture();
    const action = planTransfer(pkg, destinationId, destination, approval).replacements[0];
    let updates = 0;
    await replaceHealthTargets({
        healthTargets: {
            async findUnique(args) {
                assert.deepEqual(args, { where: { userId: destinationId } });
                return databaseTargets(existing);
            },
            async updateMany({ where, data }) {
                updates++;
                assert.equal(where.id, existing.id);
                assert.equal(where.userId, destinationId);
                assert.equal(where.updatedAt.toISOString(), existing.updatedAt);
                assert.equal(where.carbsGramsPerDay.toFixed(2), existing.carbsGramsPerDay);
                const source = structuredClone(pkg.records.healthTargets[0]);
                delete source.id;
                delete source.userId;
                assert.deepEqual(data, { ...source, updatedAt: new Date(source.updatedAt) });
                assert.equal(data.carbsGramsPerDay, null);
                assert.equal(Object.hasOwn(data, "id"), false);
                assert.equal(Object.hasOwn(data, "userId"), false);
                return { count: 1 };
            },
        },
    }, action);
    assert.equal(updates, 1);
});

test("writer independently rejects stale preimages, wrong owners/models and concurrent changes", async () => {
    const { pkg, destination, approval, existing } = replacementFixture();
    const action = planTransfer(pkg, destinationId, destination, approval).replacements[0];
    for (const current of [null, { ...existing, id: "changed" }, { ...existing, waterMlPerDay: 1 }]) {
        await assert.rejects(replaceHealthTargets({ healthTargets: {
            async findUnique() {
                return current && databaseTargets(current);
            },
            updateMany() {
                assert.fail("stale review wrote data");
            },
        } }, action), /HEALTH_TARGETS_REVIEW_STALE/);
    }
    await assert.rejects(replaceHealthTargets({}, {
        ...action, record: { ...action.record, userId: "other" },
    }), /REPLACEMENT_OWNER_MISMATCH/);
    for (const model of ["healthLog", "monthlyFinanceSnapshot", "financeSpendingPlan", "expenseCategory", "user"]) {
        await assert.rejects(replaceHealthTargets({}, {
            ...action, model,
        }), /UNAPPROVED_MODEL/);
    }
    await assert.rejects(replaceHealthTargets({ healthTargets: {
        async findUnique() {
            return databaseTargets(existing);
        },
        async updateMany() {
            return { count: 0 };
        },
    } }, action), /HEALTH_TARGETS_REVIEW_STALE/);
});

test("replacement clears all eight destination targets when the source explicitly contains NULLs", async () => {
    const { pkg, destination, approval, existing } = replacementFixture();
    const fields = [
        "weightGoalKg", "stepsPerDay", "sleepMinutesPerDay", "waterMlPerDay",
        "caloriesKcalPerDay", "proteinGramsPerDay", "carbsGramsPerDay", "fiberGramsPerDay",
    ];
    for (const field of fields) pkg.records.healthTargets[0][field] = null;
    const action = planTransfer(pkg, destinationId, destination, approval).replacements[0];
    await replaceHealthTargets({ healthTargets: {
        async findUnique() {
            return databaseTargets(existing);
        },
        async updateMany({ data }) {
            for (const field of fields) assert.equal(data[field], null);
            assert.equal(Object.keys(data).length, 9);
            return { count: 1 };
        },
    } }, action);
});

test("Production apply requires a separate explicit write policy and exactly one destination", () => {
    const { policy } = replacementFixture();
    assert.doesNotThrow(() => assertImportPolicy(policy, "production", false, true));
    assert.throws(() => assertImportPolicy(policy, "production", true, true), /PRODUCTION_APPLY_POLICY_REQUIRED/);
    const writable = { ...policy, readOnly: false, allowProductionApply: true };
    assert.doesNotThrow(() => assertImportPolicy(writable, "production", true, true));
    assert.doesNotThrow(() => assertImportPolicy(writable, "production", false, true));
    assert.throws(() => assertImportPolicy({ ...writable, readOnly: true }, "production", true, true), /READ_ONLY_POLICY/);
    assert.throws(() => assertImportPolicy({ ...writable, destinations: {
        ...writable.destinations, production: [],
    } }, "production", true, true), /SINGLE_PRODUCTION_DESTINATION_REQUIRED/);
    assert.throws(() => assertImportPolicy(writable, "local-test", false, true), /PROCESS_ENV_PRODUCTION_IMPORT_REQUIRED/);
    assert.doesNotThrow(() => assertImportPolicy(writable, "production", true, false));
    assert.throws(() => assertImportPolicy(policy, "production", true, false), /PRODUCTION_APPLY_POLICY_REQUIRED/);
});
