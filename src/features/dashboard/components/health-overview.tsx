"use client";

import Link from "next/link";
import { Moon, Footprints, Flame, Dumbbell } from "lucide-react";
import { Card, LoadError, Progress, Skeleton, SkeletonRegion } from "@/components/ui";
import { getTodayHealthLog, getTodayHealthProgress } from "@/features/health/utils/health-calculations";
import { formatProgressValue } from "@/features/health/utils/health-formatters";
import { useDashboardHealth } from "../hooks/use-dashboard-health";

const metrics = [
    { key: "calories", field: "caloriesKcal", label: "Calories", icon: Flame },
    { key: "protein", field: "proteinGrams", label: "Protein", icon: Dumbbell },
    { key: "steps", field: "steps", label: "Steps", icon: Footprints },
    { key: "sleep", field: "sleepMinutes", label: "Sleep", icon: Moon },
] as const;

export function HealthOverview() {
    const { ready, failed, logs, targets, retry } = useDashboardHealth();
    const todayLog = getTodayHealthLog(logs);
    const progress = getTodayHealthProgress(todayLog, targets);

    return (
        <Card>
            <div className="flex items-start justify-between gap-3 border-b border-border-subtle p-5">
                <div>
                    <p className="text-sm font-semibold text-text-primary">Today</p>
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
            ) : !todayLog ? (
                <div className="space-y-2 p-5">
                    <p className="text-sm font-medium text-text-primary">No health measurements recorded today</p>
                    <p className="text-sm text-text-secondary">
                        Record your daily measurements in Health to see your activity and target progress here.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-2 divide-x divide-y divide-border-subtle sm:grid-cols-4 sm:divide-y-0">
                    {metrics.map((metric) => {
                        const Icon = metric.icon;
                        const value = todayLog[metric.field];
                        const target = progress.find((item) => item.key === metric.key);

                        return (
                            <div key={metric.key} className="p-5">
                                <div className="flex items-center gap-2 text-text-muted">
                                    <Icon className="size-3.5" aria-hidden="true" />
                                    <span className="text-[11px]">{metric.label}</span>
                                </div>
                                <p className="mt-3 text-lg font-semibold text-text-primary">
                                    {value !== undefined ? formatProgressValue(value, metric.key) : "Not recorded"}
                                </p>
                                <p className="mt-1 text-[11px] text-text-muted">
                                    {target ? `Target: ${formatProgressValue(target.target, metric.key)}` : "No target set"}
                                </p>
                                {target?.percentage !== null && target?.percentage !== undefined && (
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
