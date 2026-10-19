import { formatDateValue } from "../../../lib/utils/date";
import type { FinanceData } from "../types/finance";
import { financialSnapshot, monthlyActivity } from "./finance-calculations";
import { monthlyActivityComparison } from "./finance-comparisons";

export interface FinanceChartPoint {
    month: string;
    income: number;
    expenses: number;
    netWorth: number | null;
}

/** Missing historical positions stay unavailable; only API snapshots supply past values. */
export function buildFinanceChartData(data: FinanceData, today = new Date()): FinanceChartPoint[] {
    const history = data.positionHistory ?? [];
    const current = financialSnapshot(data);
    const activity = monthlyActivityComparison(data.transactions, today).current;
    const hasPosition = history.length > 0 ||
        data.accounts.length + data.investments.length + data.liabilities.length > 0;

    return Array.from({ length: 6 }, (_, index) => {
        const start = new Date(today.getFullYear(), today.getMonth() - 5 + index, 1);
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
        const latest = history
            .filter((snapshot) => {
                const time = Date.parse(snapshot.recordedAt);
                return time >= start.getTime() && time < end.getTime() && time <= today.getTime();
            })
            .reduce<(typeof history)[number] | undefined>((previous, snapshot) =>
                !previous || Date.parse(snapshot.recordedAt) >= Date.parse(previous.recordedAt)
                    ? snapshot : previous, undefined);
        const values = index === 5 ? activity
            : monthlyActivity(data.transactions, formatDateValue(start).slice(0, 7));

        return {
            month: start.toLocaleDateString("en-IN", { month: "short" }),
            income: values.income,
            expenses: values.expenses,
            netWorth: index === 5
                ? hasPosition ? current.netWorth : null
                : latest ? latest.bank + latest.investments - latest.debt : null,
        };
    });
}
