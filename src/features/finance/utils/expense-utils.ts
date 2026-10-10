import { formatDateValue } from "@/lib/utils/date";
import type { Expense } from "../types/expense";

export interface ExpenseSummaryData {
    monthTotal: number;
    todayTotal: number;
    dailyAverage: number;
    transactionCount: number;
    todayTransactionCount: number;
    monthLabel: string;
    daysElapsed: number;
}

export function getExpenseSummary(
    expenses: Expense[],
    currentDate: Date = new Date(),
): ExpenseSummaryData {
    const today = formatDateValue(currentDate);
    const currentMonth = today.slice(0, 7);

    // Include expenses from the current month up to today.
    const monthExpenses = expenses.filter(
        (expense) =>
            expense.date.startsWith(currentMonth) &&
            expense.date <= today,
    );

    const todayExpenses = monthExpenses.filter(
        (expense) => expense.date === today,
    );

    const monthTotal = monthExpenses.reduce(
        (total, expense) => total + expense.amount,
        0,
    );

    const todayTotal = todayExpenses.reduce(
        (total, expense) => total + expense.amount,
        0,
    );

    const daysElapsed = currentDate.getDate();

    const monthLabel = new Intl.DateTimeFormat("en-IN", {
        month: "long",
    }).format(currentDate);

    return {
        monthTotal,
        todayTotal,
        dailyAverage: monthTotal / daysElapsed,
        transactionCount: monthExpenses.length,
        todayTransactionCount: todayExpenses.length,
        monthLabel,
        daysElapsed,
    };
}