import { readFileSync } from "node:fs";
import type { PrismaClient } from "@/generated/prisma/client";
import { financeMoneySchema } from "../../schemas/finance-request-schema";
import { ensureExpenseCategory } from "../../server/expense-categories";
import { historicalColumns, monthlySnapshotSchema, sumMoney, type MonthlySnapshot } from "../contracts";
import { snapshotDto } from "./service";

export function normalizeSourceAmount(value: unknown): number {
    return value === "" || value === null || value === undefined ? 0 : financeMoneySchema.parse(value);
}

/** Validate the entire source before connecting, including plan-only imports. */
export function validateHistoricalData(source: unknown) {
    if (!Array.isArray(source) || source.length !== 12) throw new Error("Expected all 12 supplied rows, including IDEAL.");
    const rows = source.map((raw, index) => {
        const expectedMonth = index === 0 ? "IDEAL" : index === 1 ? "2025-12" : `2026-${String(index - 1).padStart(2, "0")}`;
        if (raw.month !== expectedMonth) throw new Error(`Expected row ${expectedMonth}.`);
        const row = monthlySnapshotSchema.parse({
            ...raw, month: index === 0 ? "2025-12" : raw.month,
            categories: raw.categories.map((item: { name: string; amount: unknown }) => ({
                name: item.name === "Fule" ? "Fuel" : item.name,
                amount: normalizeSourceAmount(item.amount),
            })),
            total: normalizeSourceAmount(raw.total), income: normalizeSourceAmount(raw.income), left: normalizeSourceAmount(raw.left),
        });
        if (row.categories.length !== historicalColumns.length || historicalColumns.some((name, at) => row.categories[at].name !== name)) {
            throw new Error(`${expectedMonth}: the supplied category columns do not match.`);
        }
        const total = sumMoney(row.categories.map((item) => item.amount));
        if (total !== row.total) throw new Error(`${expectedMonth}: category sum ${total} differs from supplied TOTAL ${row.total}.`);
        if (row.income !== 34800) throw new Error(`${expectedMonth}: expected supplied INCOME 34800, received ${row.income}.`);
        if (row.left !== sumMoney([row.income, -row.total])) throw new Error(`${expectedMonth}: LEFT ${row.left} differs from INCOME minus TOTAL ${sumMoney([row.income, -row.total])}.`);
        return row;
    });
    if (rows[0].total !== 33403 || rows[0].left !== 1397) throw new Error("IDEAL must total 33403 with a 1397 reference buffer.");
    return { ideal: rows[0], history: rows.slice(1) };
}

export function readHistoricalSource() {
    return validateHistoricalData(JSON.parse(readFileSync(new URL("./historical-data.json", import.meta.url), "utf8")));
}

export async function importMonthlyHistory(
    client: Pick<PrismaClient, "$transaction">,
    userId: string,
    options: { dryRun: boolean; part: "history" | "plan" | "all" },
    source = readHistoricalSource(),
) {
    if (!userId.trim()) throw new Error("Select an explicit existing owner ID.");
    return client.$transaction(async (tx) => {
        const owner = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!owner) throw new Error("The selected owner does not exist.");
        const existing = await tx.monthlyFinanceSnapshot.findMany({ where: { userId } });
        const plan = await tx.financeSpendingPlan.findUnique({ where: { userId } });
        const counts = { create: 0, update: 0, unchanged: 0, plan: "not requested", validatedRows: 12 };
        if (options.part !== "plan") {
            for (const row of source.history) {
                const old = existing.find((item) => item.month === row.month);
                const changed = !old || JSON.stringify(snapshotDto(old)) !== JSON.stringify(row);
                if (!changed) { counts.unchanged++; continue; }
                if (old) counts.update++; else counts.create++;
                if (!options.dryRun) {
                    const fields = snapshotFields(row);
                    await tx.monthlyFinanceSnapshot.upsert({
                        where: { userId_month: { userId, month: row.month } },
                        create: { userId, ...fields }, update: fields,
                    });
                }
            }
        }
        if (options.part !== "history") {
            counts.plan = plan ? plan.referenceIncome === null ? "initialize reference only" : "preserve saved plan" : "create";
            if (!options.dryRun && !plan) {
                const targets = [];
                for (const target of source.ideal.categories) {
                    const category = await ensureExpenseCategory(tx, userId, target.name);
                    targets.push({ name: category.name, amount: target.amount });
                }
                // Rows are unique by user ID; this importer never replaces edited targets.
                await tx.financeSpendingPlan.create({ data: { userId, targets, referenceIncome: source.ideal.income.toString() } });
            } else if (!options.dryRun && plan?.referenceIncome === null) {
                await tx.financeSpendingPlan.update({ where: { userId }, data: { referenceIncome: source.ideal.income.toString() } });
            }
        }
        return counts;
    }, { isolationLevel: "Serializable" });
}

function snapshotFields(row: MonthlySnapshot) {
    return {
        month: row.month, categories: row.categories,
        total: row.total.toString(), income: row.income.toString(), left: row.left.toString(),
    };
}
