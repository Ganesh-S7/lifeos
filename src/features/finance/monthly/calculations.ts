import type { FinanceTransaction } from "../types/finance";
import { categoryNameKey } from "../utils/expense-categories";
import { formatDateValue } from "@/lib/utils/date";
import {
    firstHistoricalMonth, firstLiveMonth, historicalColumns, lastHistoricalMonth,
    sumMoney, type CategoryAmount, type MonthlyBreakdownData,
} from "./contracts";

export interface MonthlyRow {
    month: string;
    source: "historical" | "live" | "unavailable";
    categories: CategoryAmount[];
    total: number | null;
    income: number | null;
    left: number | null;
}

export function browserMonth() {
    return formatDateValue(new Date()).slice(0, 7);
}

export function monthLabel(month: string) {
    const [year, number] = month.split("-").map(Number);
    return new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit" }).format(new Date(year, number - 1, 1));
}

function monthRange(from: string, through: string) {
    const months: string[] = [];
    for (let month = from; month <= through;) {
        months.push(month);
        const [year, number] = month.split("-").map(Number);
        month = `${number === 12 ? year + 1 : year}-${String(number === 12 ? 1 : number + 1).padStart(2, "0")}`;
    }
    return months;
}

export function buildMonthlyRows(data: MonthlyBreakdownData, transactions: FinanceTransaction[], currentMonth: string): MonthlyRow[] {
    const snapshots = new Map(data.snapshots.map((row) => [row.month, row]));
    const historical: MonthlyRow[] = monthRange(firstHistoricalMonth, lastHistoricalMonth).map((month) => {
        const snapshot = snapshots.get(month);
        return snapshot ? { ...snapshot, source: "historical" }
            : { month, source: "unavailable", categories: [], total: null, income: null, left: null };
    });
    const live: MonthlyRow[] = monthRange(firstLiveMonth, currentMonth).map((month) => {
        const entries = transactions.filter((entry) => entry.date.startsWith(`${month}-`));
        const incomes = entries.filter((entry) => entry.type === "income");
        const expenses = entries.filter((entry) => entry.type === "expense");
        const names = [...new Set(expenses.map((entry) => entry.category || "Other"))];
        const total = sumMoney(expenses.map((entry) => entry.amount));
        const income = incomes.length ? sumMoney(incomes.map((entry) => entry.amount)) : null;
        return {
            month, source: "live", total, income,
            left: income === null ? null : sumMoney([income, -total]),
            categories: names.map((name) => ({ name, amount: sumMoney(expenses.filter((entry) => (entry.category || "Other") === name).map((entry) => entry.amount)) })),
        };
    });
    return [...historical, ...live];
}

/** Only existing category-name equivalence is applied, never semantic aliases. */
export function breakdownColumns(data: MonthlyBreakdownData, rows: MonthlyRow[]) {
    const columns = new Map<string, string>(historicalColumns.map((name) => [categoryNameKey(name), name]));
    for (const item of [...(data.plan?.targets ?? []), ...rows.filter((row) => row.source === "live").flatMap((row) => row.categories)]) {
        columns.set(categoryNameKey(item.name), item.name);
    }
    return [...columns.values()];
}

export function categoryAmount(values: CategoryAmount[], category: string) {
    return sumMoney(values.filter((value) => categoryNameKey(value.name) === categoryNameKey(category)).map((value) => value.amount));
}
