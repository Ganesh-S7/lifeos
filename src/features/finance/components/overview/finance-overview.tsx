"use client";

import Link from "next/link";
import {
    ArrowRight,
    CalendarDays,
    ChartNoAxesColumnIncreasing,
    ReceiptText,
    Wallet,
} from "lucide-react";

import { mockExpenses } from "@/features/finance/data/mock-expenses";
import {
    buildCategoryBreakdown,
    buildSpendingTrend,
} from "@/features/finance/data/mock-finance-overview";
import { getExpenseSummary } from "@/features/finance/utils/expense-utils";

import { SpendingTrendChart } from "./spending-trend-chart";
import { CategoryBreakdownChart } from "./category-breakdown-chart";

import { formatCurrency } from "@/lib/utils/currency";
import { formatDateDisplay, formatDateValue } from "@/lib/utils/date";

const metricIcons = [
    Wallet,
    CalendarDays,
    ChartNoAxesColumnIncreasing,
    ReceiptText,
];

export function FinanceOverview() {
    const now = new Date();
    const today = formatDateValue(now);

    const summary = getExpenseSummary(mockExpenses, now);

    const spendingTrend = buildSpendingTrend(mockExpenses, now);
    const categoryBreakdown = buildCategoryBreakdown(mockExpenses, now);

    const recentTransactions = mockExpenses
        .filter((expense) => expense.date <= today)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5);

    const metrics = [
        {
            label: "This month",
            value: formatCurrency(summary.monthTotal),
            description: "Total recorded spending",
        },
        {
            label: "Today",
            value: formatCurrency(summary.todayTotal),
            description: "Spent so far today",
        },
        {
            label: "Daily average",
            value: formatCurrency(summary.dailyAverage),
            description: "Average per elapsed day",
        },
        {
            label: "Transactions",
            value: String(summary.transactionCount),
            description: "Recorded this month",
        },
    ];

    return (
        <div className="space-y-6">
            {/* Page header */}
            <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
                        Finance overview
                    </h1>

                    <p className="mt-1 text-sm text-text-secondary">
                        Understand your spending and stay on top of your money.
                    </p>
                </div>

                <Link
                    href="/finance/expenses"
                    className="inline-flex w-fit items-center gap-2 rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-subtle"
                >
                    Manage expenses
                    <ArrowRight className="h-4 w-4" />
                </Link>
            </header>

            {/* Summary cards */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {metrics.map((metric, index) => {
                    const Icon = metricIcons[index];

                    return (
                        <article
                            key={metric.label}
                            className="rounded-2xl border border-border bg-surface p-5"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium text-text-secondary">
                                    {metric.label}
                                </p>

                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-subtle text-primary">
                                    <Icon className="h-4 w-4" />
                                </div>
                            </div>

                            <p className="mt-4 text-2xl font-semibold tracking-tight text-text-primary">
                                {metric.value}
                            </p>

                            <p className="mt-1 text-xs text-text-muted">
                                {metric.description}
                            </p>
                        </article>
                    );
                })}
            </section>

            {/* Charts */}
            <section className="grid grid-cols-1 gap-4 xl:grid-cols-5">
                <div className="xl:col-span-3">
                    <SpendingTrendChart data={spendingTrend} />
                </div>

                <div className="xl:col-span-2">
                    <CategoryBreakdownChart data={categoryBreakdown} />
                </div>
            </section>

            {/* Recent transactions */}
            <section className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h2 className="text-base font-semibold text-text-primary">
                            Recent transactions
                        </h2>

                        <p className="mt-1 text-sm text-text-secondary">
                            Your latest recorded expenses
                        </p>
                    </div>

                    <Link
                        href="/finance/expenses"
                        className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    >
                        View all
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>

                {recentTransactions.length === 0 ? (
                    <div className="flex h-32 items-center justify-center">
                        <p className="text-sm text-text-muted">
                            No transactions to show yet.
                        </p>
                    </div>
                ) : (
                    <div className="mt-3 divide-y divide-border">
                        {recentTransactions.map((expense) => (
                            <div
                                key={expense.id}
                                className="flex items-center justify-between gap-4 py-3.5"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-text-primary">
                                        {expense.merchant}
                                    </p>

                                    <p className="mt-1 text-xs text-text-secondary">
                                        {expense.category} · {formatDateDisplay(expense.date)}
                                    </p>
                                </div>

                                <p className="shrink-0 text-sm font-semibold text-text-primary">
                                    −{formatCurrency(expense.amount)}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <p className="text-xs text-text-muted">
                Overview values are based on the current mock expense records.
                Historical chart values are illustrative until more data is available.
            </p>
        </div>
    );
}