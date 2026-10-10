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

    previousPeriodTotal: number;
    previousPeriodTransactionCount: number;
    previousPeriodLabel: string;
    spendingChangePercent: number | null;
}

export function getExpenseSummary(
    expenses: Expense[],
    currentDate: Date = new Date(),
): ExpenseSummaryData {
    const today = formatDateValue(currentDate);
    const currentMonth = today.slice(0, 7);

    const year = currentDate.getFullYear();
    const monthIndex = currentDate.getMonth();

    // Compare the same elapsed period in the previous month.
    const previousMonthLastDay = new Date(
        year,
        monthIndex,
        0,
    ).getDate();

    const comparisonDay = Math.min(
        currentDate.getDate(),
        previousMonthLastDay,
    );

    const previousMonthStart = formatDateValue(
        new Date(year, monthIndex - 1, 1),
    );

    const previousMonth = previousMonthStart.slice(0, 7);

    const previousPeriodEnd = formatDateValue(
        new Date(year, monthIndex - 1, comparisonDay),
    );

    const monthExpenses = expenses.filter(
        (expense) =>
            expense.date.startsWith(currentMonth) &&
            expense.date <= today,
    );

    const todayExpenses = monthExpenses.filter(
        (expense) => expense.date === today,
    );

    const previousPeriodExpenses = expenses.filter(
        (expense) =>
            expense.date.startsWith(previousMonth) &&
            expense.date <= previousPeriodEnd,
    );

    const sumExpenses = (items: Expense[]) =>
        items.reduce(
            (total, expense) => total + expense.amount,
            0,
        );

    const monthTotal = sumExpenses(monthExpenses);
    const todayTotal = sumExpenses(todayExpenses);
    const previousPeriodTotal = sumExpenses(previousPeriodExpenses);

    const spendingChangePercent =
        previousPeriodTotal > 0
            ? ((monthTotal - previousPeriodTotal) /
                previousPeriodTotal) *
            100
            : null;

    const monthLabel = new Intl.DateTimeFormat("en-IN", {
        month: "long",
    }).format(currentDate);

    const previousMonthLabel = new Intl.DateTimeFormat("en-IN", {
        month: "short",
    }).format(new Date(year, monthIndex - 1, 1));

    return {
        monthTotal,
        todayTotal,
        dailyAverage: monthTotal / currentDate.getDate(),
        transactionCount: monthExpenses.length,
        todayTransactionCount: todayExpenses.length,
        monthLabel,
        daysElapsed: currentDate.getDate(),

        previousPeriodTotal,
        previousPeriodTransactionCount:
            previousPeriodExpenses.length,
        previousPeriodLabel: `${previousMonthLabel} 1–${comparisonDay}`,
        spendingChangePercent,
    };
}