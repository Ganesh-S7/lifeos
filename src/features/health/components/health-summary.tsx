"use client";

import {
    Footprints,
    Moon,
    Scale,
    Utensils,
} from "lucide-react";

import { Stat } from "@/components/ui";

import { formatDateDisplay } from "@/lib/utils/date";

import type {
    HealthLog,
    HealthTargets,
} from "../types/health";

import {
    formatHealthDuration,
    formatHealthInteger,
    formatHealthNumber,
} from "../utils/health-formatters";

interface HealthSummaryProps {
    latestWeight: HealthLog | undefined;
    latestSleep: HealthLog | undefined;
    todayLog: HealthLog | undefined;
    targets: HealthTargets | null;
}

export function HealthSummary({
    latestWeight,
    latestSleep,
    todayLog,
    targets,
}: HealthSummaryProps) {
    const weightValue =
        latestWeight?.weightKg !== undefined
            ? `${formatHealthNumber(latestWeight.weightKg)} kg`
            : "—";

    const weightDescription = latestWeight
        ? targets?.weightGoalKg !== undefined
            ? `Goal: ${formatHealthNumber(targets.weightGoalKg)} kg · Recorded ${formatDateDisplay(latestWeight.date)}`
            : `Recorded ${formatDateDisplay(latestWeight.date)}`
        : targets?.weightGoalKg !== undefined
            ? `Goal: ${formatHealthNumber(targets.weightGoalKg)} kg`
            : "No weight recorded yet";

    const stepsValue =
        todayLog?.steps !== undefined
            ? formatHealthInteger(todayLog.steps)
            : "—";

    const stepsDescription =
        todayLog?.steps !== undefined
            ? targets?.stepsPerDay !== undefined
                ? `Target: ${formatHealthInteger(targets.stepsPerDay)} steps`
                : "Recorded today"
            : "No steps recorded today";

    const sleepValue =
        latestSleep?.sleepMinutes !== undefined
            ? formatHealthDuration(latestSleep.sleepMinutes)
            : "—";

    const sleepDescription = latestSleep
        ? `Recorded ${formatDateDisplay(latestSleep.date)}`
        : "No sleep records yet";

    const caloriesValue =
        todayLog?.caloriesKcal !== undefined
            ? `${formatHealthInteger(todayLog.caloriesKcal)} kcal`
            : "—";

    const nutritionDescription =
        todayLog?.proteinGrams !== undefined
            ? `Protein: ${formatHealthNumber(todayLog.proteinGrams)} g`
            : todayLog?.caloriesKcal !== undefined
                ? "Protein not recorded today"
                : todayLog?.carbsGrams !== undefined ||
                    todayLog?.fiberGrams !== undefined ||
                    todayLog?.waterMl !== undefined
                    ? "Nutrition or hydration partially recorded"
                    : "No nutrition logged today";

    return (
        <section
            className="space-y-3"
            aria-labelledby="health-summary-title"
        >
            <div>
                <h2
                    id="health-summary-title"
                    className="text-base font-semibold text-text-primary"
                >
                    Health snapshot
                </h2>

                <p className="text-xs text-text-secondary">
                    Your latest measurements and today&apos;s activity.
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat
                    label="Weight"
                    value={weightValue}
                    description={weightDescription}
                    icon={Scale}
                />

                <Stat
                    label="Steps today"
                    value={stepsValue}
                    description={stepsDescription}
                    icon={Footprints}
                />

                <Stat
                    label="Latest sleep"
                    value={sleepValue}
                    description={sleepDescription}
                    icon={Moon}
                />

                <Stat
                    label="Nutrition"
                    value={caloriesValue}
                    description={nutritionDescription}
                    icon={Utensils}
                />
            </div>
        </section>
    );
}