"use client";

import { useId, type ReactNode } from "react";
import Link from "next/link";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Card, ChartSkeleton, LoadError, SkeletonRegion } from "@/components/ui";
import { FinanceRefreshNotice } from "@/features/finance/components/finance-refresh-notice";
import { useFinance } from "@/features/finance/store/finance-store";
import { buildFinanceChartData } from "@/features/finance/utils/finance-chart-data";
import { getWeightTrend } from "@/features/health/utils/health-calculations";
import { formatHealthNumber } from "@/features/health/utils/health-formatters";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateDisplay, parseDateValue } from "@/lib/utils/date";
import { useDashboardHealth } from "../hooks/use-dashboard-health";

const axis = { fill: "var(--text-secondary)", fontSize: 11 };
const tooltipStyle = {
    backgroundColor: "var(--surface-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    color: "var(--text-primary)",
    fontSize: 12,
    boxShadow: "none",
};
const tooltipLabelStyle = { color: "var(--text-secondary)", marginBottom: 4 };

function AnalysisCard({
    title,
    description,
    href,
    linkLabel,
    children,
}: {
    title: string;
    description: string;
    href: string;
    linkLabel: string;
    children: ReactNode;
}) {
    const titleId = useId();

    return (
        <Card role="region" aria-labelledby={titleId} className="min-w-0 overflow-hidden p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 id={titleId} className="text-sm font-semibold text-text-primary">{title}</h2>
                    <p className="mt-1 text-xs text-text-secondary">{description}</p>
                </div>
                <Link href={href} className="text-xs font-medium text-primary hover:underline">
                    {linkLabel}
                </Link>
            </div>
            <div className="mt-5 space-y-3">{children}</div>
        </Card>
    );
}

export function IncomeExpensesChart() {
    const { data, ready, loadError, refreshError, refreshing, retry } = useFinance();
    const points = ready ? buildFinanceChartData(data) : [];
    const hasActivity = points.some((point) => point.income > 0 || point.expenses > 0);

    return (
        <AnalysisCard
            title="Monthly income vs expenses"
            description="Last six months · current month through today · INR"
            href="/finance"
            linkLabel="View Finance"
        >
            {!ready ? (
                loadError ? (
                    <LoadError message="Unable to load your financial activity. Please try again." onRetry={retry} />
                ) : (
                    <SkeletonRegion label="Loading monthly income and expenses">
                        <ChartSkeleton />
                    </SkeletonRegion>
                )
            ) : (
                <>
                    <FinanceRefreshNotice
                        message={refreshError ? "Your saved data is shown. Finance could not refresh. Please try again." : ""}
                        refreshing={refreshing}
                        onRetry={retry}
                    />
                    {!hasActivity ? (
                        <div className="flex min-h-64 flex-col justify-center gap-2 text-center">
                            <p className="text-sm font-medium text-text-primary">No income or expenses in this period</p>
                            <p className="text-sm text-text-secondary">
                                Record income or an expense in Finance to see your monthly totals here.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="h-64 w-full min-w-0">
                                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                    <BarChart
                                        data={points}
                                        accessibilityLayer
                                        aria-label="Monthly income and ordinary expenses in Indian rupees"
                                        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                                    >
                                        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
                                        <XAxis
                                            dataKey="month"
                                            tick={axis}
                                            axisLine={false}
                                            tickLine={false}
                                            minTickGap={16}
                                        />
                                        <YAxis
                                            width={96}
                                            tick={axis}
                                            axisLine={false}
                                            tickLine={false}
                                            tickFormatter={(value) => formatCurrency(Number(value))}
                                        />
                                        <Tooltip
                                            cursor={{ fill: "var(--surface-hover)" }}
                                            formatter={(value) => formatCurrency(Number(value))}
                                            contentStyle={tooltipStyle}
                                            labelStyle={tooltipLabelStyle}
                                        />
                                        <Legend formatter={(value) => <span className="text-xs text-text-secondary">{value}</span>} />
                                        <Bar
                                            dataKey="income"
                                            name="Income"
                                            fill="var(--chart-income)"
                                            radius={[4, 4, 0, 0]}
                                            isAnimationActive={false}
                                        />
                                        <Bar
                                            dataKey="expenses"
                                            name="Expenses"
                                            fill="var(--chart-expenses)"
                                            radius={[4, 4, 0, 0]}
                                            isAnimationActive={false}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="sr-only">
                                <table className="w-full text-left tabular-nums">
                                    <caption className="sr-only">Monthly income and ordinary expenses in INR</caption>
                                    <thead>
                                        <tr>
                                            <th scope="col" className="py-2 pr-3">Month</th>
                                            <th scope="col" className="py-2 pr-3">Income</th>
                                            <th scope="col" className="py-2">Expenses</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {points.map((point) => (
                                            <tr key={point.month} className="border-t border-border-subtle">
                                                <th scope="row" className="py-2 pr-3 font-normal">{point.month}</th>
                                                <td className="py-2 pr-3">{formatCurrency(point.income)}</td>
                                                <td className="py-2">{formatCurrency(point.expenses)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-xs text-text-muted">Transfers and investment trades are excluded. Months without activity total zero.</p>
                        </>
                    )}
                </>
            )}
        </AnalysisCard>
    );
}

export function WeightTrendChart() {
    const { logs, ready, failed, retry } = useDashboardHealth();
    const now = new Date();
    const measurements = ready
        ? getWeightTrend(logs, now, 90).filter((point) => Number.isFinite(point.weightKg) && point.weightKg > 0)
        : [];

    return (
        <AnalysisCard
            title="Weight trend"
            description="Last 90 days · recorded body weight in kg"
            href="/health"
            linkLabel="View Health"
        >
            {!ready ? (
                failed ? (
                    <LoadError message="Unable to load your weight measurements. Please try again." onRetry={retry} />
                ) : (
                    <SkeletonRegion label="Loading weight measurements">
                        <ChartSkeleton />
                    </SkeletonRegion>
                )
            ) : measurements.length < 2 ? (
                <div className="flex min-h-64 flex-col justify-center gap-2 text-center">
                    <p className="text-sm font-medium text-text-primary">
                        {measurements.length === 0 ? "No weight measurements in this period" : "One weight measurement recorded"}
                    </p>
                    <p className="text-sm text-text-secondary">
                        Record weight on at least two different days in Health to see a trend.
                    </p>
                </div>
            ) : (
                <>
                    <div className="h-64 w-full min-w-0">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            <LineChart
                                data={measurements}
                                accessibilityLayer
                                aria-label="Recorded body weight over the last 90 days in kilograms"
                                margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
                            >
                                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
                                <XAxis
                                    dataKey="date"
                                    tick={axis}
                                    axisLine={false}
                                    tickLine={false}
                                    minTickGap={28}
                                    tickFormatter={(value) => parseDateValue(String(value)).toLocaleDateString("en-IN", {
                                        day: "numeric",
                                        month: "short",
                                    })}
                                />
                                <YAxis
                                    width={72}
                                    domain={["auto", "auto"]}
                                    tick={axis}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(value) => `${formatHealthNumber(Number(value))} kg`}
                                />
                                <Tooltip
                                    cursor={{ stroke: "var(--border)" }}
                                    labelFormatter={(value) => formatDateDisplay(String(value))}
                                    formatter={(value) => `${formatHealthNumber(Number(value))} kg`}
                                    contentStyle={tooltipStyle}
                                    labelStyle={tooltipLabelStyle}
                                />
                                <Legend formatter={(value) => <span className="text-xs text-text-secondary">{value}</span>} />
                                <Line
                                    type="linear"
                                    dataKey="weightKg"
                                    name="Weight (kg)"
                                    stroke="var(--brand)"
                                    strokeWidth={2}
                                    dot={{ r: 3, fill: "var(--brand)", strokeWidth: 0 }}
                                    connectNulls
                                    isAnimationActive={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="sr-only">
                        <table className="w-full text-left tabular-nums">
                            <caption className="sr-only">Recorded weight measurements in kilograms</caption>
                            <thead>
                                <tr>
                                    <th scope="col" className="py-2 pr-3">Date</th>
                                    <th scope="col" className="py-2">Weight</th>
                                </tr>
                            </thead>
                            <tbody>
                                {measurements.map((point) => (
                                    <tr key={point.date} className="border-t border-border-subtle">
                                        <th scope="row" className="py-2 pr-3 font-normal">{formatDateDisplay(point.date)}</th>
                                        <td className="py-2">{formatHealthNumber(point.weightKg)} kg</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-xs text-text-muted">Successive recorded weights are connected. No measurements are added for missing days.</p>
                </>
            )}
        </AnalysisCard>
    );
}

export function OverviewAnalysis() {
    return (
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <IncomeExpensesChart />
            <WeightTrendChart />
        </div>
    );
}
