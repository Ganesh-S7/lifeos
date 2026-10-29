"use client";

import Link from "next/link";
import { Moon, Footprints, Flame, Dumbbell } from "lucide-react";
import { Card, LoadError, Progress, Skeleton, SkeletonRegion } from "@/components/ui";
import {
    getRecentHealthLogs,
    getTodayDateKey,
    getTodayHealthLog,
    getTodayHealthProgress,
} from "@/features/health/utils/health-calculations";
import { formatProgressValue } from "@/features/health/utils/health-formatters";
import { formatDateDisplay } from "@/lib/utils/date";
import { useDashboardHealth } from "../hooks/use-dashboard-health";

const metrics = [
    { key: "calories", field: "caloriesKcal", label: "Calories", icon: Flame },
    { key: "protein", field: "proteinGrams", label: "Protein", icon: Dumbbell },
    { key: "steps", field: "steps", label: "Steps", icon: Footprints },
    { key: "sleep", field: "sleepMinutes", label: "Sleep", icon: Moon },
] as const;

export function HealthOverview() {
    const { ready, failed, logs, targets, retry } = useDashboardHealth();
    const today = getTodayDateKey();
    const todayLog = getTodayHealthLog(logs, today);
    const progress = getTodayHealthProgress(todayLog, targets);
    const history = getRecentHealthLogs(logs.filter((log) => log.date < today), logs.length);
    const measurements = metrics.map((metric) => {
        const record = typeof todayLog?.[metric.field] === "number"
            ? todayLog
            : history.find((log) => typeof log[metric.field] === "number");
        return { ...metric, record, historical: Boolean(record && record.date !== today) };
    });
    const hasMeasurements = measurements.some((metric) => metric.record);
    const hasHistorical = measurements.some((metric) => metric.historical);

    return (
        <Card className="border-0 bg-transparent shadow-none md:border md:bg-surface md:shadow-sm">
            <div className="flex items-start justify-between gap-3 md:border-b border-border-subtle py-2 md:p-5">
                <div>
                    <p className="text-sm font-semibold text-text-primary">
                        {hasHistorical ? "Latest recorded measurements" : "Today"}
                    </p>
                    <p className="mt-1 text-xs text-text-secondary">Health &amp; activity</p>
                </div>
                <Link href="/health" className="text-xs font-medium text-primary hover:underline">
                    Open Health
                </Link>
            </div>

            {!ready ? (
                failed ? (
                    <LoadError message="Unable to load your health data. Please try again." onRetry={retry} />
                ) : (
                    <SkeletonRegion label="Loading today's health measurements" className="grid grid-cols-2 sm:grid-cols-4">
                        {metrics.map((metric) => (
                            <div key={metric.key} className="space-y-3 p-5">
                                <Skeleton variant="text" className="w-20" />
                                <Skeleton className="h-7 w-24" />
                                <Skeleton variant="text" className="w-24" />
                            </div>
                        ))}
                    </SkeletonRegion>
                )
            ) : !todayLog && !hasMeasurements ? (
                <div className="space-y-1 border-l-2 border-border pl-3 py-2 md:space-y-2 md:border-l-0 md:p-5">
                    <p className="text-sm font-medium text-text-primary">No health measurements recorded today</p>
                    <p className="text-sm text-text-secondary">
                        Record your daily measurements in Health to see your activity and target progress here.
                    </p>
                    <Link href="/health" className="inline-flex min-h-11 items-center text-xs font-medium text-primary hover:underline">
                        Log today&apos;s health
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-3 md:gap-0 md:divide-x md:divide-border-subtle sm:grid-cols-4">
                    {measurements.map((metric) => {
                        const Icon = metric.icon;
                        const value = metric.record?.[metric.field];
                        const target = progress.find((item) => item.key === metric.key);

                        return (
                            <div key={metric.key} className="min-w-0 py-2 md:p-5">
                                <div className="flex items-center gap-2 text-text-muted">
                                    <Icon className="size-3.5" aria-hidden="true" />
                                    <span className="text-[11px]">{metric.label}</span>
                                </div>
                                <p className="mt-1 md:mt-3 text-base md:text-lg font-semibold text-text-primary">
                                    {value !== undefined ? formatProgressValue(value, metric.key) : "Not recorded"}
                                </p>
                                <p className="mt-1 text-[11px] text-text-muted">
                                    {metric.historical && metric.record ? (
                                        <>
                                            Last recorded{" "}
                                            <time dateTime={metric.record.date}>
                                                {formatDateDisplay(metric.record.date)}
                                            </time>
                                        </>
                                    ) : (
                                        <>
                                            {hasHistorical && value !== undefined && "Today · "}
                                            {target ? `Target: ${formatProgressValue(target.target, metric.key)}` : "No target set"}
                                        </>
                                    )}
                                </p>
                                {!metric.historical && target?.percentage !== null && target?.percentage !== undefined && (
                                    <div role="group" aria-label={`${metric.label}: ${target.percentage}% of target`}>
                                        <Progress value={target.percentage} className="mt-3 h-1" />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
}
