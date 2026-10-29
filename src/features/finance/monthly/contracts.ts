import { z } from "zod";
import { financeMoneySchema } from "../schemas/finance-request-schema";
import { expenseCategoryNameSchema } from "../schemas/expense-category-schema";
import { categoryNameKey } from "../utils/expense-categories";

export const historicalColumns = [
    "Rent", "Groceries", "Food", "Traveling", "Taxi", "Bills", "Purchase",
    "Laundry", "Fuel", "Other", "Bike", "EMI", "GYM", "SUP", "Invest",
] as const;
export const firstLiveMonth = "2026-11";
export const firstHistoricalMonth = "2025-12";
export const lastHistoricalMonth = "2026-10";

export function sumMoney(values: number[]): number {
    return financeMoneySchema.parse(values.reduce((sum, value) => sum + Math.round(value * 100), 0) / 100);
}

export const categoryAmountSchema = z.strictObject({
    name: expenseCategoryNameSchema,
    amount: financeMoneySchema.nonnegative(),
});
export const spendingPlanRequestSchema = z.strictObject({
    targets: z.array(categoryAmountSchema).max(100),
}).superRefine(({ targets }, context) => {
    const seen = new Set<string>();
    targets.forEach((target, index) => {
        const key = categoryNameKey(target.name);
        if (seen.has(key)) context.addIssue({ code: "custom", path: ["targets", index, "name"], message: "Choose each category only once." });
        seen.add(key);
    });
    if (!financeMoneySchema.safeParse(targets.reduce((sum, target) => sum + Math.round(target.amount * 100), 0) / 100).success) {
        context.addIssue({ code: "custom", path: ["targets"], message: "The total exceeds the supported amount range." });
    }
});
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const monthlySnapshotSchema = z.strictObject({
    month: monthSchema,
    categories: z.array(categoryAmountSchema),
    total: financeMoneySchema.nonnegative(),
    income: financeMoneySchema.nonnegative(),
    left: financeMoneySchema,
});
export const spendingPlanSchema = z.strictObject({
    targets: z.array(categoryAmountSchema),
    referenceIncome: financeMoneySchema.nonnegative().nullable(),
    updatedAt: z.string(),
});
export const monthlyBreakdownResponseSchema = z.strictObject({
    snapshots: z.array(monthlySnapshotSchema),
    plan: spendingPlanSchema.nullable(),
});
export type CategoryAmount = z.infer<typeof categoryAmountSchema>;
export type MonthlySnapshot = z.infer<typeof monthlySnapshotSchema>;
export type SpendingPlan = z.infer<typeof spendingPlanSchema>;
export type SpendingPlanRequest = z.infer<typeof spendingPlanRequestSchema>;
export type MonthlyBreakdownData = z.infer<typeof monthlyBreakdownResponseSchema>;
