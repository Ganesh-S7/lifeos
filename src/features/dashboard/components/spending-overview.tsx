"use client";

import Link from "next/link";
import { Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, ChartSkeleton, LoadError, SkeletonRegion } from "@/components/ui";
import { useFinance } from "@/features/finance/store/finance-store";
import { categorySpending } from "@/features/finance/utils/finance-calculations";
import { monthlyActivityComparison } from "@/features/finance/utils/finance-comparisons";
import { FinanceComparison } from "@/features/finance/components/overview/finance-comparison";
import { FinanceRefreshNotice } from "@/features/finance/components/finance-refresh-notice";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateValue } from "@/lib/utils/date";

const categoryColors = [
    "var(--chart-income)",
    "var(--chart-expenses)",
    "var(--chart-category-3)",
    "var(--chart-category-4)",
    "var(--chart-category-5)",
    "var(--chart-category-6)",
    "var(--chart-category-7)",
];
const percentageFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

export function SpendingOverview() {
    const { data, ready, loadError, refreshError, refreshing, retry } = useFinance();
    const now = new Date();
    const today = formatDateValue(now);
    const activity = monthlyActivityComparison(data.transactions, now);
    const categories = categorySpending(
        data.transactions.filter((transaction) => transaction.date <= today),
        today.slice(0, 7),
    );
    const slices = categories.map((item, index) => ({
        ...item,
        fill: categoryColors[index % categoryColors.length],
    }));

    return (
        <Card className="min-w-0 overflow-hidden">
            <div className="flex items-start justify-between p-5">
                <div>
                    <p className="text-sm font-semibold text-text-primary">Spending overview</p>
                    <p className="mt-1 text-xs text-text-secondary">
                        {now.toLocaleDateString("en-IN", { month: "long" })} · through today
                    </p>
                </div>
                <Link href="/finance/expenses" className="text-xs text-primary hover:underline">
                    View expenses
                </Link>
            </div>
            <div className="space-y-5 px-5 pb-5">
                {!ready ? (
                    loadError ? (
                        <LoadError message="Unable to load your spending. Please try again." onRetry={retry} />
                    ) : (
                        <SkeletonRegion label="Loading spending by category"><ChartSkeleton /></SkeletonRegion>
                    )
                ) : (
                    <>
                        <FinanceRefreshNotice message={refreshError} refreshing={refreshing} onRetry={retry} />
                        <div>
                            <p className="text-3xl font-semibold tracking-tight text-text-primary">
                                {formatCurrency(activity.current.expenses)}
                            </p>
                            <FinanceComparison comparison={activity.expenses} period="vs previous period" />
                        </div>
                        {categories.length === 0 ? (
                            <p className="py-5 text-sm text-text-muted">No expenses recorded this month yet.</p>
                        ) : (
                            <div className="grid min-w-0 items-center gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                                <div className="relative h-56 w-full min-w-0">
                                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                        <PieChart accessibilityLayer aria-label="Current month spending by category">
                                            <Pie
                                                data={slices}
                                                dataKey="amount"
                                                nameKey="category"
                                                innerRadius="58%"
                                                outerRadius="85%"
                                                paddingAngle={2}
                                                stroke="var(--surface)"
                                                strokeWidth={2}
                                                isAnimationActive={false}
                                            />
                                            <Tooltip
                                                formatter={(value) => formatCurrency(Number(value))}
                                                contentStyle={{
                                                    backgroundColor: "var(--surface-elevated)",
                                                    border: "1px solid var(--border)",
                                                    borderRadius: 12,
                                                    color: "var(--text-primary)",
                                                    fontSize: 12,
                                                    boxShadow: "none",
                                                }}
                                                itemStyle={{ color: "var(--text-primary)" }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
                                        <span className="text-xl font-semibold text-text-primary">{categories.length}</span>
                                        <span className="text-xs text-text-secondary">{categories.length === 1 ? "category" : "categories"}</span>
                                    </div>
                                </div>
                                <ul aria-label="Spending category totals" className="min-w-0 space-y-3">
                                    {slices.map((item) => (
                                        <li key={item.category} className="flex items-start gap-2.5 text-xs">
                                            <span className="mt-0.5 size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: item.fill }} aria-hidden="true" />
                                            <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                                <span className="break-words text-text-secondary">{item.category}</span>
                                                <span className="tabular-nums text-text-primary">
                                                    {formatCurrency(item.amount)}
                                                    <span className="ml-2 text-text-muted">
                                                        {percentageFormatter.format(item.amount / activity.current.expenses * 100)}%
                                                    </span>
                                                </span>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </>
                )}
            </div>
        </Card>
    );
}
