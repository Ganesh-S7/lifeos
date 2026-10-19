"use client";

import Link from "next/link";
import { Card, ChartSkeleton, LoadError } from "@/components/ui";
import { useFinance } from "@/features/finance/store/finance-store";
import { categorySpending } from "@/features/finance/utils/finance-calculations";
import { monthlyActivityComparison } from "@/features/finance/utils/finance-comparisons";
import { FinanceComparison } from "@/features/finance/components/overview/finance-comparison";
import { FinanceRefreshNotice } from "@/features/finance/components/finance-refresh-notice";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateValue } from "@/lib/utils/date";

export function SpendingOverview() {
    const { data, ready, loadError, refreshError, refreshing, retry } = useFinance();
    const now = new Date();
    const today = formatDateValue(now);
    const activity = monthlyActivityComparison(data.transactions, now);
    const categories = categorySpending(
        data.transactions.filter((transaction) => transaction.date <= today),
        today.slice(0, 7),
    );
    const maxValue = Math.max(0, ...categories.map((item) => item.amount));

    return (
        <Card className="overflow-hidden">
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
                    loadError ? <LoadError message={loadError} onRetry={retry} /> : <ChartSkeleton />
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
                            <div className="space-y-4">
                                {categories.map((item) => (
                                    <div key={item.category}>
                                        <div className="mb-2 flex items-center justify-between text-xs">
                                            <span className="text-text-secondary">{item.category}</span>
                                            <span className="font-medium text-text-primary">
                                                {formatCurrency(item.amount)}
                                            </span>
                                        </div>
                                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-elevated">
                                            <div
                                                className="h-full rounded-full bg-primary transition-all"
                                                style={{ width: `${(item.amount / maxValue) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </Card>
    );
}
