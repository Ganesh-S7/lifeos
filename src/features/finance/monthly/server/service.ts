import type { FinanceSpendingPlan, MonthlyFinanceSnapshot, PrismaClient } from "@/generated/prisma/client";
import { ensureExpenseCategory } from "../../server/expense-categories";
import {
    monthlySnapshotSchema, spendingPlanSchema, spendingPlanRequestSchema,
    type SpendingPlanRequest,
} from "../contracts";

export function snapshotDto(row: MonthlyFinanceSnapshot) {
    return monthlySnapshotSchema.parse({
        month: row.month, categories: row.categories,
        total: row.total.toNumber(), income: row.income.toNumber(), left: row.left.toNumber(),
    });
}

export function planDto(row: FinanceSpendingPlan) {
    return spendingPlanSchema.parse({
        targets: row.targets, referenceIncome: row.referenceIncome?.toNumber() ?? null,
        updatedAt: row.updatedAt.toISOString(),
    });
}

export async function readMonthlyBreakdown(client: Pick<PrismaClient, "monthlyFinanceSnapshot" | "financeSpendingPlan">, userId: string) {
    if (!userId.trim()) throw new Error("An authenticated user is required.");
    const [snapshots, plan] = await Promise.all([
        client.monthlyFinanceSnapshot.findMany({ where: { userId }, orderBy: { month: "asc" } }),
        client.financeSpendingPlan.findUnique({ where: { userId } }),
    ]);
    return { snapshots: snapshots.map(snapshotDto), plan: plan ? planDto(plan) : null };
}

export async function saveSpendingPlan(client: Pick<PrismaClient, "$transaction">, userId: string, input: SpendingPlanRequest) {
    if (!userId.trim()) throw new Error("An authenticated user is required.");
    const parsed = spendingPlanRequestSchema.parse(input);
    return client.$transaction(async (tx) => {
        const targets = [];
        for (const target of parsed.targets) {
            const category = await ensureExpenseCategory(tx, userId, target.name);
            targets.push({ name: category.name, amount: target.amount });
        }
        return planDto(await tx.financeSpendingPlan.upsert({
            where: { userId }, create: { userId, targets }, update: { targets },
        }));
    }, { isolationLevel: "Serializable" });
}
