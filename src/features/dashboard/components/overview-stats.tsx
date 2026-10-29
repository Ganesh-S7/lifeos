"use client";

import { ArrowLeftRight, Wallet } from "lucide-react";
import { InfoTooltip, LoadError, Skeleton, SkeletonRegion, Stat } from "@/components/ui";
import { formatCurrency } from "@/lib/utils/currency";
import { useFinance } from "@/features/finance/store/finance-store";
import { monthlyActivityComparison } from "@/features/finance/utils/finance-comparisons";
import { FinanceComparison } from "@/features/finance/components/overview/finance-comparison";
import { FinanceRefreshNotice } from "@/features/finance/components/finance-refresh-notice";
import { HealthStats } from "./health-stats";

export function OverviewStats() {
    const { data, ready, loadError, refreshError, refreshing, retry } = useFinance();
    const activity = monthlyActivityComparison(data.transactions, new Date());

    return (
        <section className="space-y-3">
            <div className="grid grid-cols-2 gap-3 lg:gap-4 xl:grid-cols-4">
                {!ready ? (
                    <div className="col-span-2">
                        {loadError ? <LoadError message={loadError} onRetry={retry} /> : (
                            <SkeletonRegion
                                label="Loading financial statistics"
                                className="grid grid-cols-2 gap-3 lg:gap-4"
                            >
                                {[0, 1].map((index) => (
                                    <div key={index} className="min-w-0 space-y-3 rounded-xl border border-border p-3 md:p-5">
                                        <Skeleton variant="text" className="w-full max-w-28" />
                                        <Skeleton className="h-7 w-full max-w-32" />
                                        <Skeleton variant="text" className="w-full max-w-40" />
                                    </div>
                                ))}
                            </SkeletonRegion>
                        )}
                    </div>
                ) : (
                    <>
                        <Stat
                            compactMobile
                            label="Monthly spending"
                            value={formatCurrency(activity.current.expenses)}
                            className="min-w-0"
                            labelInfo={
                                <InfoTooltip label="About monthly spending">
                                    Ordinary expenses from the start of this month through today, compared with the same elapsed days
                                    of the previous month (capped at that month&apos;s end). Transfers and investment trades are excluded.
                                </InfoTooltip>
                            }
                            icon={Wallet}
                            footerClassName="mt-auto pt-3"
                            footer={<FinanceComparison comparison={activity.expenses} period="vs previous period" />}
                        />
                        <Stat
                            compactMobile
                            label="Net cash flow"
                            value={formatCurrency(activity.current.netCashFlow)}
                            className="min-w-0"
                            labelInfo={
                                <InfoTooltip label="About net cash flow">
                                    Income minus ordinary expenses through today, including Untracked expenses and excluding transfers and investment trades. This measures reported activity, not account movements.
                                    The comparison uses the same elapsed days of the previous month, capped at that month&apos;s end.
                                </InfoTooltip>
                            }
                            icon={ArrowLeftRight}
                            footerClassName="mt-auto pt-3"
                            footer={<FinanceComparison comparison={activity.netCashFlow} period="vs previous period" />}
                        />
                    </>
                )}
                <HealthStats />
            </div>
            {ready && (
                <FinanceRefreshNotice message={refreshError} refreshing={refreshing} onRetry={retry} />
            )}
        </section>
    );
}
