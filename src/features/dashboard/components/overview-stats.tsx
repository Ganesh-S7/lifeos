"use client";

import { ArrowLeftRight, CircleDollarSign, HeartPulse, Wallet } from "lucide-react";
import { LoadError, Skeleton, SkeletonRegion, Stat } from "@/components/ui";
import { formatCurrency } from "@/lib/utils/currency";
import { useFinance } from "@/features/finance/store/finance-store";
import { monthlyActivityComparison } from "@/features/finance/utils/finance-comparisons";
import { FinanceComparison } from "@/features/finance/components/overview/finance-comparison";
import { FinanceRefreshNotice } from "@/features/finance/components/finance-refresh-notice";
import { overviewStats } from "../data/mock-data";

const icons = [HeartPulse, CircleDollarSign];

export function OverviewStats() {
    const { data, ready, loadError, refreshError, refreshing, retry } = useFinance();
    const activity = monthlyActivityComparison(data.transactions, new Date());

    return (
        <section className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {!ready ? (
                    <div className="sm:col-span-2">
                        {loadError ? <LoadError message={loadError} onRetry={retry} /> : (
                            <SkeletonRegion
                                label="Loading financial statistics"
                                className="grid gap-3 sm:grid-cols-2"
                            >
                                {[0, 1].map((index) => (
                                    <div key={index} className="space-y-4 rounded-xl border border-border p-5">
                                        <Skeleton variant="text" className="w-28" />
                                        <Skeleton className="h-7 w-32" />
                                        <Skeleton variant="text" className="w-40" />
                                    </div>
                                ))}
                            </SkeletonRegion>
                        )}
                    </div>
                ) : (
                    <>
                        <Stat
                            label="Monthly spending"
                            value={formatCurrency(activity.current.expenses)}
                            description="Ordinary expenses through today"
                            icon={Wallet}
                            footer={<FinanceComparison comparison={activity.expenses} period="vs previous period" />}
                        />
                        <Stat
                            label="Net cash flow"
                            value={formatCurrency(activity.current.netCashFlow)}
                            description="Income minus expenses through today"
                            icon={ArrowLeftRight}
                            footer={<FinanceComparison comparison={activity.netCashFlow} period="vs previous period" />}
                        />
                    </>
                )}
                {overviewStats.map((stat, index) => (
                    <Stat
                        key={stat.label}
                        label={stat.label}
                        value={stat.value}
                        description={stat.description}
                        trend={stat.trend}
                        icon={icons[index]}
                    />
                ))}
            </div>
            {ready && (
                <FinanceRefreshNotice message={refreshError} refreshing={refreshing} onRetry={retry} />
            )}
        </section>
    );
}
