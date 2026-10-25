"use client";

import Link from "next/link";
import { Moon, Scale } from "lucide-react";
import { InfoTooltip, LoadError, Skeleton, SkeletonRegion, Stat } from "@/components/ui";
import { formatDateDisplay } from "@/lib/utils/date";
import { getLatestSleepLog, getLatestWeightLog } from "@/features/health/utils/health-calculations";
import { formatHealthDuration, formatHealthNumber } from "@/features/health/utils/health-formatters";
import { useDashboardHealth } from "../hooks/use-dashboard-health";

export function HealthStats() {
    const { ready, failed, logs, targets, retry } = useDashboardHealth();

    if (!ready) {
        return (
            <div className="sm:col-span-2">
                {failed ? (
                    <LoadError message="Unable to load your health data. Please try again." onRetry={retry} />
                ) : (
                    <SkeletonRegion label="Loading health statistics" className="grid gap-3 sm:grid-cols-2">
                        {[0, 1].map((index) => (
                            <div key={index} className="space-y-4 rounded-xl border border-border bg-surface p-5">
                                <Skeleton variant="text" className="w-28" />
                                <Skeleton className="h-7 w-32" />
                                <Skeleton variant="text" className="w-40" />
                            </div>
                        ))}
                    </SkeletonRegion>
                )}
            </div>
        );
    }

    const weight = getLatestWeightLog(logs);
    const sleep = getLatestSleepLog(logs);
    const weightDescription = weight
        ? `Recorded ${formatDateDisplay(weight.date)}`
        : "No weight recorded yet";
    const weightGoal = targets?.weightGoalKg !== undefined
        ? ` · Goal: ${formatHealthNumber(targets.weightGoalKg)} kg`
        : "";

    return (
        <>
            <Stat
                label="Weight"
                value={weight?.weightKg !== undefined ? `${formatHealthNumber(weight.weightKg)} kg` : "—"}
                className="min-w-0"
                labelInfo={
                    <InfoTooltip label="About weight">
                        Latest recorded weight. {weightDescription}{weightGoal}. Record your measurements and target in Health.
                    </InfoTooltip>
                }
                icon={Scale}
                footerClassName="mt-auto pt-3"
                footer={weight ? (
                    <span className="text-xs text-text-secondary">{weightDescription}</span>
                ) : (
                    <Link href="/health" className="text-xs font-medium text-primary hover:underline">No weight recorded yet</Link>
                )}
            />
            <Stat
                label="Latest sleep"
                value={sleep?.sleepMinutes !== undefined ? formatHealthDuration(sleep.sleepMinutes) : "—"}
                className="min-w-0"
                labelInfo={
                    <InfoTooltip label="About latest sleep">
                        Your latest recorded sleep measurement{sleep ? `, recorded ${formatDateDisplay(sleep.date)}` : "; no sleep records yet"}.
                    </InfoTooltip>
                }
                icon={Moon}
                footerClassName="mt-auto pt-3"
                footer={sleep ? (
                    <span className="text-xs text-text-secondary">Recorded {formatDateDisplay(sleep.date)}</span>
                ) : (
                    <Link href="/health" className="text-xs font-medium text-primary hover:underline">No sleep records yet</Link>
                )}
            />
        </>
    );
}
