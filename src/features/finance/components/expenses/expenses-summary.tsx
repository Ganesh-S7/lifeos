import {
    CalendarDays,
    Receipt,
    Wallet,
} from "lucide-react";

import { Stat } from "@/components/ui";
import { getExpenseSummary } from "../../utils/expense-utils";
import type { Expense } from "../../types/expense";
import { formatCurrency } from "@/lib/utils/currency";

interface ExpensesSummaryProps {
    expenses: Expense[];
}

export function ExpensesSummary({
    expenses,
}: ExpensesSummaryProps) {
    const summary = getExpenseSummary(expenses);

    const todayDescription =
        summary.todayTransactionCount === 0
            ? "No transactions today"
            : `${summary.todayTransactionCount} transaction${summary.todayTransactionCount === 1 ? "" : "s"
            } today`;

    const stats = [
        {
            label: "This month",
            value: formatCurrency(summary.monthTotal),
            description: `${summary.monthLabel} to date`,
            trend: "neutral" as const,
            icon: Wallet,
        },
        {
            label: "Today",
            value: formatCurrency(summary.todayTotal),
            description: todayDescription,
            trend: "neutral" as const,
            icon: Receipt,
        },
        {
            label: "Daily average",
            value: formatCurrency(summary.dailyAverage),
            description: `Average across ${summary.daysElapsed} days`,
            trend: "neutral" as const,
            icon: CalendarDays,
        },
        {
            label: "Transactions",
            value: summary.transactionCount.toLocaleString("en-IN"),
            description: `${summary.monthLabel} to date`,
            trend: "neutral" as const,
            icon: Receipt,
        },
    ];

    return (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
                <Stat
                    key={stat.label}
                    label={stat.label}
                    value={stat.value}
                    description={stat.description}
                    trend={stat.trend}
                    icon={stat.icon}
                />
            ))}
        </section>
    );
}