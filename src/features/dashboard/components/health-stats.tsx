"use client";

import Link from "next/link";
import { Moon, Scale } from "lucide-react";
import { LoadError, Skeleton, SkeletonRegion, Stat } from "@/components/ui";
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
                description={`${weightDescription}${weightGoal}`}
                icon={Scale}
                footer={!weight && (
                    <Link href="/health" className="text-xs font-medium text-primary hover:underline">
                        Record your measurements in Health
                    </Link>
                )}
            />
            <Stat
                label="Latest sleep"
                value={sleep?.sleepMinutes !== undefined ? formatHealthDuration(sleep.sleepMinutes) : "—"}
                description={sleep ? `Recorded ${formatDateDisplay(sleep.date)}` : "No sleep records yet"}
                icon={Moon}
            />
        </>
    );
}
