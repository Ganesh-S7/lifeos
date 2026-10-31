import "./register-typescript.mjs";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier.startsWith("@/")) {
            const file = new URL(`../../src/${specifier.slice(2)}.ts`, import.meta.url);
            if (existsSync(file)) return nextResolve(file.href, context);
        }
        return nextResolve(specifier, context);
    },
});

const contracts = await import("../../src/lib/server/data-transfer/contracts.ts");
const { readHistoricalSource } = await import("../../src/features/finance/monthly/server/historical-import.ts");
const { builtInExpenseCategories, categoryNameKey } = await import("../../src/features/finance/utils/expense-categories.ts");
export { contracts };
export const time = "2026-10-30T01:02:03.456Z";
export const owner = { id: "source-owner", email: "owner@example.invalid" };
export const destinationId = "destination-owner";
export const models = contracts.models;
export function emptyDestination() {
    return { records: Object.fromEntries(models.map((name) => [name, []])), identifiers: [] };
}
export function resign(pkg) {
    pkg.sha256 = contracts.sha256(contracts.canonical({ manifest: pkg.manifest, records: pkg.records }));
    return pkg;
}
export function fixture() {
    const source = readHistoricalSource();
    const categoryAmounts = (items) => items.map((item) => ({ ...item, amount: item.amount.toFixed(2) }));
    const records = {
        healthLog: Array.from({ length: 17 }, (_, index) => ({
            id: `log-${index}`, userId: owner.id, date: `2026-10-${index + 13}`,
            weightKg: index < 11 ? "70.25" : null, steps: 0, sleepMinutes: 480,
            waterMl: 2000, caloriesKcal: 1800, proteinGrams: "90.01", carbsGrams: null, fiberGrams: "20.50",
            createdAt: time, updatedAt: time,
        })),
        healthTargets: [{
            id: "target", userId: owner.id, weightGoalKg: "65.50", stepsPerDay: 8000,
            sleepMinutesPerDay: 480, waterMlPerDay: 2500, caloriesKcalPerDay: 2000,
            proteinGramsPerDay: "100.25", carbsGramsPerDay: null, fiberGramsPerDay: "25.00", updatedAt: time,
        }],
        monthlyFinanceSnapshot: source.history.map((row) => ({
            ...row, id: `snapshot-${row.month}`, userId: owner.id,
            categories: categoryAmounts(row.categories), total: row.total.toFixed(2),
            income: row.income.toFixed(2), left: row.left.toFixed(2), createdAt: time, updatedAt: time,
        })),
        financeSpendingPlan: [{
            userId: owner.id, targets: categoryAmounts(source.ideal.categories),
            referenceIncome: "34800.00", createdAt: time, updatedAt: time,
        }],
        expenseCategory: source.ideal.categories.filter((row) => !builtInExpenseCategories.includes(row.name)).map((row, index) => ({
            id: `category-${index}`, userId: owner.id, name: row.name,
            normalizedName: categoryNameKey(row.name), createdAt: time,
        })),
    };
    const policy = contracts.policySchema.parse({
        version: 1, source: { host: "127.0.0.1", port: 3306, database: "lifeos" },
        destinations: {
            production: [{ host: "approved.example", port: 3306, database: "production" }],
            "local-test": [{ host: "127.0.0.1", port: 3306, database: "lifeos_transfer_test" }],
        },
        expectedCounts: contracts.recordCounts(records), additionalCategoryIds: [],
    });
    const manifest = {
        version: 1, exportedAt: time,
        source: { ownerId: owner.id, email: owner.email, fingerprint: contracts.fingerprint(policy.source) },
        schema: { sha256: contracts.schemaHash(), migrations: contracts.requiredMigrations },
        counts: contracts.recordCounts(records),
    };
    const pkg = resign({ manifest, records });
    return { pkg: contracts.validatePackage(pkg, policy), policy };
}
