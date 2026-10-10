import type { Expense } from "@/features/finance/types/expense";
import { formatDateValue } from "@/lib/utils/date";

export interface SpendingTrendPoint {
    month: string;
    amount: number;
    isSample: boolean;
}

export interface CategorySpendingPoint {
    category: string;
    amount: number;
}

// Placeholder values for months where we haven't seeded transactions yet.
// These are for the UI preview only.
const sampleHistoricalSpending: Record<number, number> = {
    5: 24100,
    4: 27300,
    3: 22800,
    2: 30200,
};

/**
 * Builds a six-month spending trend.
 *
 * Months without seeded transaction data use illustrative values.
 * The previous and current months use the available expense records.
 */
export function buildSpendingTrend(
    expenses: Expense[],
    currentDate = new Date(),
): SpendingTrendPoint[] {
    const today = formatDateValue(currentDate);

    return Array.from({ length: 6 }, (_, index) => {
        const monthsAgo = 5 - index;

        const monthDate = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth() - monthsAgo,
            1,
        );

        const monthKey = [
            monthDate.getFullYear(),
            String(monthDate.getMonth() + 1).padStart(2, "0"),
        ].join("-");

        const monthExpenses = expenses.filter(
            (expense) =>
                expense.date.startsWith(monthKey) && expense.date <= today,
        );

        const isSample = monthsAgo >= 2;

        const amount = isSample
            ? (sampleHistoricalSpending[monthsAgo] ?? 0)
            : monthExpenses.reduce(
                (total, expense) => total + expense.amount,
                0,
            );

        return {
            month: monthDate.toLocaleDateString("en-IN", {
                month: "short",
            }),
            amount,
            isSample,
        };
    });
}

/**
 * Groups this month's recorded expenses by category.
 */
export function buildCategoryBreakdown(
    expenses: Expense[],
    currentDate = new Date(),
): CategorySpendingPoint[] {
    const today = formatDateValue(currentDate);
    const currentMonth = today.slice(0, 7);

    const totals = new Map<string, number>();

    for (const expense of expenses) {
        if (
            !expense.date.startsWith(currentMonth) ||
            expense.date > today
        ) {
            continue;
        }

        const currentTotal = totals.get(expense.category) ?? 0;

        totals.set(
            expense.category,
            currentTotal + expense.amount,
        );
    }

    return Array.from(totals.entries())
        .map(([category, amount]) => ({
            category,
            amount,
        }))
        .sort((a, b) => b.amount - a.amount);
}