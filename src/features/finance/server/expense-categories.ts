import type { PrismaClient } from "@/generated/prisma/client";
import type { ExpenseCategory } from "../schemas/expense-category-schema";
import { expenseCategoryRequestSchema } from "../schemas/expense-category-schema";
import {
    builtInExpenseCategories,
    canonicalCategoryName,
    categoryNameKey,
} from "../utils/expense-categories";

type CategoryClient = Pick<PrismaClient, "expenseCategory">;

/** The unique per-user key is the database arbiter for duplicate-create races. */
export async function ensureExpenseCategory(client: CategoryClient, userId: string, rawName: string) {
    if (!userId.trim()) throw new Error("An authenticated user is required.");
    const { name: parsed } = expenseCategoryRequestSchema.parse({ name: rawName });
    const name = canonicalCategoryName(parsed);
    const normalizedName = categoryNameKey(name);
    const where = { userId_normalizedName: { userId, normalizedName } };
    const existing = await client.expenseCategory.findUnique({ where });
    if (existing) return existing;

    try {
        return await client.expenseCategory.create({ data: { userId, name, normalizedName } });
    } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
            const duplicate = await client.expenseCategory.findUnique({ where });
            if (duplicate) return duplicate;
        }
        throw error;
    }
}

export function categoryDto(record: { id: string; name: string }): ExpenseCategory {
    return {
        id: record.id,
        name: record.name,
        builtIn: builtInExpenseCategories.some((name) => categoryNameKey(name) === categoryNameKey(record.name)),
    };
}

export async function readExpenseCategories(
    client: Pick<PrismaClient, "expenseCategory" | "financeTransaction">,
    userId: string,
): Promise<ExpenseCategory[]> {
    if (!userId.trim()) throw new Error("An authenticated user is required.");
    const [records, historical] = await Promise.all([
        client.expenseCategory.findMany({
            where: { userId },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
        client.financeTransaction.findMany({
            where: { userId, type: "expense", category: { not: null } },
            select: { category: true },
            distinct: ["category"],
        }),
    ]);
    const choices = new Map<string, ExpenseCategory>();
    for (const name of builtInExpenseCategories) {
        choices.set(categoryNameKey(name), { id: null, name, builtIn: true });
    }
    for (const record of records) choices.set(categoryNameKey(record.name), categoryDto(record));
    for (const { category } of historical) {
        if (category && !choices.has(categoryNameKey(category))) {
            choices.set(categoryNameKey(category), { id: null, name: category, builtIn: false });
        }
    }
    return [...choices.values()];
}
