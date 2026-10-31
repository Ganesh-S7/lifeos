import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { expenseCategoryNameSchema } from "../../../features/finance/schemas/expense-category-schema";
import { builtInExpenseCategories, categoryNameKey } from "../../../features/finance/utils/expense-categories";
import { readHistoricalSource } from "../../../features/finance/monthly/server/historical-import";

export const models = [
    "healthLog", "healthTargets", "monthlyFinanceSnapshot", "financeSpendingPlan", "expenseCategory",
] as const;
export type Model = typeof models[number];

export interface OperationCounts {
    create: number;
    replace: number;
    skip: number;
    conflict: number;
}

export class TransferError extends Error {
    readonly code: string;
    readonly report?: {
        counts: Record<string, OperationCounts>;
        conflicts: { model: string; code: string }[];
    };

    constructor(code: string, report?: TransferError["report"]) {
        super(code);
        this.name = "TransferError";
        this.code = code;
        this.report = report;
    }
}

export function requireTransfer(condition: unknown, code: string): asserts condition {
    if (!condition) throw new TransferError(code);
}

export function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
}

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const schemaHash = () => sha256(readFileSync(new URL("../../../../prisma/schema.prisma", import.meta.url), "utf8").replace(/\r\n/g, "\n"));
export const requiredMigrations = [
    "20261018144929_init", "20261021000000_auth_rate_limit",
    "20261028000000_expense_categories", "20261029000000_untracked_expenses",
    "20261030000000_monthly_breakdown",
];

const id = z.string().min(1).max(191);
const time = z.iso.datetime({ precision: 3 });
const date = z.iso.date();
const integer = z.number().int().min(0).max(2_147_483_647).nullable();
const decimal = (wholeDigits: number, signed = false) => z.string().regex(
    new RegExp(`^${signed ? "-?" : ""}(?:0|[1-9]\\d{0,${wholeDigits - 1}})\\.\\d{2}$`),
);
const weight = decimal(4).refine((value) => value !== "0.00").nullable();
const nutrient = decimal(6).nullable();
const money = decimal(16);
const amount = z.strictObject({ name: expenseCategoryNameSchema, amount: money });
const owned = { id, userId: id };
const log = z.strictObject({
    ...owned, date, createdAt: time, updatedAt: time,
    weightKg: weight, steps: integer, sleepMinutes: integer.refine((value) => value === null || value <= 1440),
    waterMl: integer, caloriesKcal: integer, proteinGrams: nutrient, carbsGrams: nutrient, fiberGrams: nutrient,
}).refine((row) => row.createdAt <= row.updatedAt && [
    row.weightKg, row.steps, row.sleepMinutes, row.waterMl, row.caloriesKcal,
    row.proteinGrams, row.carbsGrams, row.fiberGrams,
].some((value) => value !== null));
export const healthTargetsRecordSchema = z.strictObject({
    ...owned, updatedAt: time, weightGoalKg: weight, stepsPerDay: integer,
    sleepMinutesPerDay: integer.refine((value) => value === null || value <= 1440),
    waterMlPerDay: integer, caloriesKcalPerDay: integer,
    proteinGramsPerDay: nutrient, carbsGramsPerDay: nutrient, fiberGramsPerDay: nutrient,
});
const snapshot = z.strictObject({
    ...owned, month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    categories: z.array(amount).length(15), total: money, income: money,
    left: decimal(16, true), createdAt: time, updatedAt: time,
});
const plan = z.strictObject({
    userId: id, targets: z.array(amount).length(15), referenceIncome: money,
    createdAt: time, updatedAt: time,
});
const category = z.strictObject({
    ...owned, name: expenseCategoryNameSchema,
    normalizedName: z.string().min(1).max(200), createdAt: time,
}).refine((row) => row.normalizedName === categoryNameKey(row.name));

export const recordSetSchema = z.strictObject({
    healthLog: z.array(log).max(100_000),
    healthTargets: z.array(healthTargetsRecordSchema).length(1),
    monthlyFinanceSnapshot: z.array(snapshot).length(11),
    financeSpendingPlan: z.array(plan).length(1),
    expenseCategory: z.array(category).max(100),
});
export type RecordSet = z.infer<typeof recordSetSchema>;
export const countsSchema = z.strictObject({
    healthLog: z.number().int().min(1).max(100_000), healthTargets: z.literal(1),
    monthlyFinanceSnapshot: z.literal(11), financeSpendingPlan: z.literal(1),
    expenseCategory: z.number().int().min(0).max(100),
    weightMeasurements: z.number().int().min(0).max(100_000), planTargets: z.literal(15),
});
export const endpointSchema = z.strictObject({
    host: z.string().min(1).max(253).refine((host) => !/[\s/@?#:]/.test(host) || host === "[::1]"),
    port: z.number().int().min(1).max(65535), database: z.string().regex(/^[\w-]{1,64}$/),
});
export const healthTargetsReplacementSchema = z.discriminatedUnion("enabled", [
    z.strictObject({ enabled: z.literal(false) }),
    z.strictObject({
        enabled: z.literal(true),
        destinationUserId: id,
        recordId: id,
        expectedSHA256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
]);
export type HealthTargetsReplacement = z.infer<typeof healthTargetsReplacementSchema>;

/** Includes identity, every nullable target field and the original timestamp. */
export function healthTargetsFingerprint(record: unknown): string {
    return sha256(canonical({
        version: 1,
        model: "healthTargets",
        record: healthTargetsRecordSchema.parse(record),
    }));
}

export const policySchema = z.strictObject({
    version: z.literal(1), source: endpointSchema,
    readOnly: z.boolean().default(false),
    allowProductionApply: z.boolean().default(false),
    healthTargetsReplacement: healthTargetsReplacementSchema.default({ enabled: false }),
    destinations: z.strictObject({
        production: z.array(endpointSchema).max(10),
        "local-test": z.array(endpointSchema).max(10),
    }),
    expectedCounts: countsSchema,
    additionalCategoryIds: z.array(id).max(100),
});
export type Policy = z.infer<typeof policySchema>;
export const envelopeSchema = z.strictObject({
    manifest: z.strictObject({
        version: z.literal(1), exportedAt: time,
        source: z.strictObject({ ownerId: id, email: z.email(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }),
        schema: z.strictObject({ sha256: z.string().regex(/^[a-f0-9]{64}$/), migrations: z.array(z.string()) }),
        counts: countsSchema,
    }),
    records: recordSetSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type TransferPackage = z.infer<typeof envelopeSchema>;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const fingerprint = (endpoint: z.infer<typeof endpointSchema>) => sha256(canonical(endpoint));
export function recordCounts(records: RecordSet) {
    return {
        ...Object.fromEntries(models.map((model) => [model, records[model].length])),
        weightMeasurements: records.healthLog.filter((row) => row.weightKg !== null).length,
        planTargets: records.financeSpendingPlan[0]?.targets.length ?? 0,
    };
}

/** Exact approved historical values, using the existing validated source. */
export function validateFinance(records: RecordSet) {
    const source = readHistoricalSource();
    const expected = [...source.history].sort((a, b) => a.month.localeCompare(b.month));
    const actual = [...records.monthlyFinanceSnapshot].sort((a, b) => a.month.localeCompare(b.month));
    const amounts = (items: { name: string; amount: string }[]) => items.map((item) => ({
        name: item.name, amount: Number(item.amount),
    }));
    requireTransfer(canonical(actual.map((row) => ({
        month: row.month, categories: amounts(row.categories), total: Number(row.total),
        income: Number(row.income), left: Number(row.left),
    }))) === canonical(expected), "HISTORICAL_RECONCILIATION_FAILED");
    const current = records.financeSpendingPlan[0];
    requireTransfer(canonical(amounts(current.targets)) === canonical(source.ideal.categories) &&
        current.referenceIncome === "34800.00", "IDEAL_RECONCILIATION_FAILED");
}

export function validatePackage(input: unknown, policy: Policy): TransferPackage {
    const parsed = envelopeSchema.safeParse(input);
    requireTransfer(parsed.success, "INVALID_PACKAGE");
    const pkg = parsed.data;
    requireTransfer(canonical(input) === canonical(pkg), "NON_CANONICAL_PACKAGE");
    requireTransfer(pkg.sha256 === sha256(canonical({ manifest: pkg.manifest, records: pkg.records })), "INVALID_PACKAGE_HASH");
    requireTransfer(pkg.manifest.schema.sha256 === schemaHash() &&
        canonical(pkg.manifest.schema.migrations) === canonical(requiredMigrations), "SOURCE_SCHEMA_MISMATCH");
    requireTransfer(pkg.manifest.source.fingerprint === fingerprint(policy.source), "SOURCE_TARGET_MISMATCH");
    const counts = canonical(recordCounts(pkg.records));
    requireTransfer(counts === canonical(pkg.manifest.counts) && counts === canonical(policy.expectedCounts), "UNEXPECTED_COUNTS");
    for (const model of models) {
        const seen = new Set<string>();
        for (const row of pkg.records[model]) {
            requireTransfer(row.userId === pkg.manifest.source.ownerId, "WRONG_RECORD_OWNER");
            const key = "date" in row ? row.date : "month" in row ? row.month
                : "normalizedName" in row ? row.normalizedName : "id" in row ? row.id : row.userId;
            requireTransfer(!seen.has(key), "DUPLICATE_SOURCE_RECORD");
            seen.add(key);
        }
        const ids = pkg.records[model].map((row) => "id" in row ? row.id : row.userId);
        requireTransfer(new Set(ids).size === ids.length, "DUPLICATE_SOURCE_ID");
    }
    const planNames = new Set(pkg.records.financeSpendingPlan[0].targets.map((item) => categoryNameKey(item.name)));
    const builtIn = new Set(builtInExpenseCategories.map(categoryNameKey));
    for (const row of pkg.records.expenseCategory) {
        requireTransfer(!builtIn.has(row.normalizedName) &&
            (planNames.has(row.normalizedName) || policy.additionalCategoryIds.includes(row.id)), "CATEGORY_NOT_APPROVED");
    }
    for (const name of planNames) {
        requireTransfer(builtIn.has(name) || pkg.records.expenseCategory.some((row) => row.normalizedName === name), "CATEGORY_DEFINITION_MISSING");
    }
    validateFinance(pkg.records);
    return pkg;
}
