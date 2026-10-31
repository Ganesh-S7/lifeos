import type { Prisma, PrismaClient } from "../../../generated/prisma/client";
import { formatUtcDateValue } from "../../utils/date";
import {
    canonical, fingerprint, models, normalizeEmail, recordCounts, recordSetSchema,
    requiredMigrations, requireTransfer, schemaHash, sha256, validatePackage,
    type Model, type Policy, type RecordSet, type TransferPackage,
} from "./contracts";
import { builtInExpenseCategories, categoryNameKey } from "../../../features/finance/utils/expense-categories";
import { executePlan, mappedId, planTransfer, verifyOwner, type CreateAction } from "./plan";

type Transaction = Prisma.TransactionClient;

/** Only approved models; strict export contracts reject unreviewed new fields. */
export async function readApprovedRecords(tx: Transaction, userId: string): Promise<RecordSet> {
    const owned = { where: { userId }, orderBy: { id: "asc" as const } };
    const [logs, targets, snapshots, plans, categories] = await Promise.all([
        tx.healthLog.findMany(owned), tx.healthTargets.findMany(owned),
        tx.monthlyFinanceSnapshot.findMany(owned),
        tx.financeSpendingPlan.findMany({ where: { userId }, orderBy: { userId: "asc" } }),
        tx.expenseCategory.findMany(owned),
    ]);
    const money = (value: Prisma.Decimal | null) => value === null ? null : value.toFixed(2);
    const categoryAmounts = (value: Prisma.JsonValue) => {
        requireTransfer(Array.isArray(value), "INVALID_STORED_CATEGORIES");
        return value.map((item) => {
            requireTransfer(item && typeof item === "object" && !Array.isArray(item) &&
                typeof item.name === "string" && typeof item.amount === "number" &&
                Number.isFinite(item.amount) && Number.isSafeInteger(Math.round(item.amount * 100)) &&
                Math.abs(Math.round(item.amount * 100) / 100 - item.amount) < 0.0000001,
            "INVALID_STORED_CATEGORIES");
            return { name: item.name, amount: item.amount.toFixed(2) };
        });
    };
    return {
        healthLog: logs.map((row) => ({
            ...row, date: formatUtcDateValue(row.date),
            weightKg: money(row.weightKg), proteinGrams: money(row.proteinGrams),
            carbsGrams: money(row.carbsGrams), fiberGrams: money(row.fiberGrams),
            createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
        })),
        healthTargets: targets.map((row) => ({
            ...row, weightGoalKg: money(row.weightGoalKg), proteinGramsPerDay: money(row.proteinGramsPerDay),
            carbsGramsPerDay: money(row.carbsGramsPerDay), fiberGramsPerDay: money(row.fiberGramsPerDay),
            updatedAt: row.updatedAt.toISOString(),
        })),
        monthlyFinanceSnapshot: snapshots.map((row) => ({
            ...row, categories: categoryAmounts(row.categories), total: row.total.toFixed(2),
            income: row.income.toFixed(2), left: row.left.toFixed(2),
            createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
        })),
        financeSpendingPlan: plans.map((row) => ({
            ...row, targets: categoryAmounts(row.targets), referenceIncome: row.referenceIncome?.toFixed(2) ?? "",
            createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
        })),
        expenseCategory: categories.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    };
}

async function ownerMatches(tx: Transaction, id: string, email: string) {
    return tx.user.findMany({
        where: { OR: [{ id }, { email: normalizeEmail(email) }] },
        select: { id: true, email: true },
    });
}

/** Schema contract for transfer tables; no DDL, probes, backfills, or seed writes. */
export async function verifySchema(tx: Transaction, expectedDatabase: string) {
    const [database] = await tx.$queryRaw<{ name: string }[]>`SELECT DATABASE() AS name`;
    requireTransfer(database.name === expectedDatabase, "CONNECTED_DATABASE_MISMATCH");
    const history = await tx.$queryRaw<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>`
        SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations`;
    requireTransfer(history.every((row) => row.finished_at !== null || row.rolled_back_at !== null) &&
        requiredMigrations.every((name) => history.some((row) => row.migration_name === name && row.finished_at && !row.rolled_back_at)),
    "REQUIRED_MIGRATIONS_MISSING");
    const columns = await tx.$queryRaw<{
        TABLE_NAME: string; COLUMN_NAME: string; COLUMN_TYPE: string; IS_NULLABLE: string; COLLATION_NAME: string | null;
    }[]>`SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLLATION_NAME
        FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`;
    const expected: Record<string, Record<string, string>> = {
        user: { id: "varchar(191)", email: "varchar(191)" },
        health_logs: {
            id: "varchar(191)", userId: "varchar(191)", date: "date", weightKg: "decimal(6,2)?",
            steps: "int?", sleepMinutes: "int?", waterMl: "int?", caloriesKcal: "int?",
            proteinGrams: "decimal(8,2)?", carbsGrams: "decimal(8,2)?", fiberGrams: "decimal(8,2)?",
            createdAt: "datetime(3)", updatedAt: "datetime(3)",
        },
        health_targets: {
            id: "varchar(191)", userId: "varchar(191)", weightGoalKg: "decimal(6,2)?",
            stepsPerDay: "int?", sleepMinutesPerDay: "int?", waterMlPerDay: "int?", caloriesKcalPerDay: "int?",
            proteinGramsPerDay: "decimal(8,2)?", carbsGramsPerDay: "decimal(8,2)?", fiberGramsPerDay: "decimal(8,2)?",
            updatedAt: "datetime(3)",
        },
        monthly_finance_snapshots: {
            id: "varchar(191)", userId: "varchar(191)", month: "char(7)", categories: "json",
            total: "decimal(18,2)", income: "decimal(18,2)", left: "decimal(18,2)",
            createdAt: "datetime(3)", updatedAt: "datetime(3)",
        },
        finance_spending_plans: {
            userId: "varchar(191)", targets: "json", referenceIncome: "decimal(18,2)?",
            createdAt: "datetime(3)", updatedAt: "datetime(3)",
        },
        expense_categories: {
            id: "varchar(191)", userId: "varchar(191)", name: "varchar(100)",
            normalizedName: "varchar(200)", createdAt: "datetime(3)",
        },
    };
    for (const [table, fields] of Object.entries(expected)) {
        for (const [field, definition] of Object.entries(fields)) {
            const actual = columns.find((row) => row.TABLE_NAME === table && row.COLUMN_NAME === field);
            requireTransfer(actual && actual.COLUMN_TYPE.toLowerCase() === definition.replace(/\?$/, "") &&
                actual.IS_NULLABLE === (definition.endsWith("?") ? "YES" : "NO"), "INCOMPATIBLE_SCHEMA");
        }
    }
    requireTransfer(columns.some((row) => row.TABLE_NAME === "expense_categories" &&
        row.COLUMN_NAME === "normalizedName" && row.COLLATION_NAME === "utf8mb4_bin"), "CATEGORY_COLLATION_MISMATCH");
    const keys = await tx.$queryRaw<{ TABLE_NAME: string; COLUMN_NAME: string; CONSTRAINT_NAME: string }[]>`
        SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
        WHERE CONSTRAINT_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = 'user' AND REFERENCED_COLUMN_NAME = 'id'`;
    for (const table of Object.keys(expected).filter((table) => table !== "user")) {
        requireTransfer(keys.some((row) => row.TABLE_NAME === table && row.COLUMN_NAME === "userId"), "OWNER_RELATION_MISSING");
    }
    const indexes = await tx.$queryRaw<{ TABLE_NAME: string; INDEX_NAME: string; cols: string }[]>`
        SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
        FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND NON_UNIQUE = 0
        GROUP BY TABLE_NAME, INDEX_NAME`;
    for (const [table, cols] of [
        ["user", "email"], ["health_logs", "userId,date"], ["health_targets", "userId"],
        ["monthly_finance_snapshots", "userId,month"], ["finance_spending_plans", "userId"],
        ["expense_categories", "userId,normalizedName"],
        ["health_logs", "id"], ["health_targets", "id"],
        ["monthly_finance_snapshots", "id"], ["expense_categories", "id"],
    ]) requireTransfer(indexes.some((row) => row.TABLE_NAME === table && row.cols === cols), "REQUIRED_UNIQUE_KEY_MISSING");
}

export async function exportPackage(client: PrismaClient, policy: Policy, sourceId: string, email: string) {
    return client.$transaction(async (tx) => {
        await verifySchema(tx, policy.source.database);
        const owner = verifyOwner(await ownerMatches(tx, sourceId, email), sourceId, email);
        const raw = await readApprovedRecords(tx, owner.id);
        const selected = new Set(raw.financeSpendingPlan.flatMap((plan) => plan.targets.map((target) => categoryNameKey(target.name))));
        for (const id of policy.additionalCategoryIds) {
            requireTransfer(raw.expenseCategory.some((row) => row.id === id), "CATEGORY_OWNER_REJECTED");
        }
        raw.expenseCategory = raw.expenseCategory.filter((row) =>
            !builtInExpenseCategories.some((name) => categoryNameKey(name) === row.normalizedName) &&
            (selected.has(row.normalizedName) || policy.additionalCategoryIds.includes(row.id)));
        const records = recordSetSchema.parse(raw);
        for (const model of models) records[model].sort((a, b) => canonical(a).localeCompare(canonical(b)));
        const manifest = {
            version: 1 as const, exportedAt: new Date().toISOString(),
            source: { ownerId: owner.id, email: normalizeEmail(owner.email), fingerprint: fingerprint(policy.source) },
            schema: { sha256: schemaHash(), migrations: requiredMigrations },
            counts: recordCounts(records),
        };
        return validatePackage({ manifest, records, sha256: sha256(canonical({ manifest, records })) }, policy);
    }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
}

/** No updates/upserts/deletes: a failed create rolls the whole transaction back. */
export async function createTransferredRecord(tx: Transaction, action: CreateAction) {
    const row = action.record;
    if (action.model === "healthLog" && "date" in row) {
        await tx.healthLog.create({ data: {
            ...row,
            date: new Date(`${row.date}T00:00:00.000Z`),
            createdAt: new Date(row.createdAt),
            updatedAt: new Date(row.updatedAt),
        } });
    } else if (action.model === "healthTargets" && "weightGoalKg" in row) {
        await tx.healthTargets.create({ data: { ...row, updatedAt: new Date(row.updatedAt) } });
    } else if (action.model === "monthlyFinanceSnapshot" && "month" in row) {
        await tx.monthlyFinanceSnapshot.create({ data: {
            ...row, categories: row.categories.map((item) => ({ name: item.name, amount: Number(item.amount) })),
            createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt),
        } });
    } else if (action.model === "financeSpendingPlan" && "targets" in row) {
        await tx.financeSpendingPlan.create({ data: {
            ...row, targets: row.targets.map((item) => ({ name: item.name, amount: Number(item.amount) })),
            createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt),
        } });
    } else if (action.model === "expenseCategory" && "normalizedName" in row) {
        await tx.expenseCategory.create({ data: { ...row, createdAt: new Date(row.createdAt) } });
    } else requireTransfer(false, "UNAPPROVED_MODEL");
}

export async function inspectDestination(tx: Transaction, pkg: TransferPackage, destinationId: string) {
    const records = await readApprovedRecords(tx, destinationId);
    const categoryKeys = records.expenseCategory.map((row) => categoryNameKey(row.name));
    requireTransfer(new Set(categoryKeys).size === categoryKeys.length &&
        records.expenseCategory.every((row) => row.normalizedName === categoryNameKey(row.name)), "DESTINATION_CATEGORY_INVALID");
    const identifiers: { model: Model; id: string; userId: string }[] = [];
    for (const model of models) {
        if (model === "financeSpendingPlan") continue;
        const ids = pkg.records[model].map((row) => mappedId(pkg, destinationId, model, row.id));
        const args = { where: { id: { in: ids } }, select: { id: true, userId: true } } as const;
        // Explicit delegates: no other-user measurements or unapproved models are read.
        const rows = model === "healthLog" ? await tx.healthLog.findMany(args)
            : model === "healthTargets" ? await tx.healthTargets.findMany(args)
                : model === "monthlyFinanceSnapshot" ? await tx.monthlyFinanceSnapshot.findMany(args)
                    : await tx.expenseCategory.findMany(args);
        identifiers.push(...rows.map((row) => ({ model, ...row })));
    }
    return { records, identifiers };
}

export async function importInTransaction(tx: Transaction, pkg: TransferPackage, destinationId: string, email: string, dryRun: boolean) {
    verifyOwner(await ownerMatches(tx, destinationId, email), destinationId, pkg.manifest.source.email);
    requireTransfer(normalizeEmail(email) === pkg.manifest.source.email, "OWNER_MAPPING_REJECTED");
    const plan = planTransfer(pkg, destinationId, await inspectDestination(tx, pkg, destinationId));
    const report = await executePlan(plan, { create: (action) => createTransferredRecord(tx, action) }, dryRun);
    return { ...report, packageSHA256: pkg.sha256 };
}

export async function importPackage(client: PrismaClient, pkg: TransferPackage, policy: Policy, database: string, destinationId: string, email: string, dryRun: boolean) {
    requireTransfer(dryRun || !policy.readOnly, "READ_ONLY_POLICY");
    validatePackage(pkg, policy);
    return client.$transaction(async (tx) => {
        await verifySchema(tx, database);
        return importInTransaction(tx, pkg, destinationId, email, dryRun);
    }, { isolationLevel: "Serializable", timeout: 30_000 });
}

