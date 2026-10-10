import {
    CalendarDays,
    Receipt,
    Wallet,
} from "lucide-react";

import { Stat } from "@/components/ui";
import { formatCurrency } from "@/lib/utils/currency";
import { getExpenseSummary } from "../../utils/expense-utils";
import type { Expense } from "../../types/expense";

interface ExpensesSummaryProps {
    expenses: Expense[];
}

function getSpendingComparison(
    percent: number | null,
    previousPeriodLabel: string,
) {
    if (percent === null) {
        return {
            description: "No comparison data",
            trend: "neutral" as const,
            trendTone: "neutral" as const,
        };
    }

    if (Math.abs(percent) < 0.05) {
        return {
            description: `About the same as ${previousPeriodLabel}`,
            trend: "neutral" as const,
            trendTone: "neutral" as const,
        };
    }

    const direction = percent < 0 ? "down" : "up";
    const comparison = percent < 0 ? "lower" : "higher";

    return {
        description: `${Math.abs(percent).toFixed(1)}% ${comparison} than ${previousPeriodLabel}`,
        trend: direction as "up" | "down",
        trendTone: percent < 0 ? "positive" as const : "negative" as const,
    };
}

function getTransactionComparison(
    currentCount: number,
    previousCount: number,
    previousPeriodLabel: string,
) {
    if (previousCount === 0) {
        return "No comparison data";
    }

    const difference = currentCount - previousCount;

    if (difference === 0) {
        return `Same as ${previousPeriodLabel}`;
    }

    return `${Math.abs(difference)} ${difference < 0 ? "fewer" : "more"
        } than ${previousPeriodLabel}`;
}

export function ExpensesSummary({
    expenses,
}: ExpensesSummaryProps) {
    const summary = getExpenseSummary(expenses);

    const spendingComparison = getSpendingComparison(
        summary.spendingChangePercent,
        summary.previousPeriodLabel,
    );

    const todayDescription =
        summary.todayTransactionCount === 0
            ? "No transactions today"
            : `${summary.todayTransactionCount} transaction${summary.todayTransactionCount === 1 ? "" : "s"
            } today`;

    const stats = [
        {
            label: "This month",
            value: formatCurrency(summary.monthTotal),
            description: spendingComparison.description,
            trend: spendingComparison.trend,
            trendTone: spendingComparison.trendTone,
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
            description: getTransactionComparison(
                summary.transactionCount,
                summary.previousPeriodTransactionCount,
                summary.previousPeriodLabel,
            ),
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
                    trendTone={stat.trendTone}
                    icon={stat.icon}
                />
            ))}
        </section>
    );
}