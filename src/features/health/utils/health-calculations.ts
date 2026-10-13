import type { HealthLog, HealthTargets } from "../types/health";

type WeightTrendPoint = {
    date: string;
    weightKg: number;
};

export type HealthProgressMetric = {
    key: string;
    label: string;
    value: number | undefined;
    target: number;
    unit: string;
    percentage: number | null;
};

/**
 * Returns a local date in YYYY-MM-DD format.
 *
 * Avoids new Date().toISOString() for calendar dates because
 * UTC conversion can shift the date in some time zones.
 */
export function getTodayDateKey(date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

/**
 * Returns the health log for a particular date.
 *
 * Defaults to today's log.
 */
export function getTodayHealthLog(
    logs: HealthLog[],
    date = getTodayDateKey(),
): HealthLog | undefined {
    return logs.find((log) => log.date === date);
}

/**
 * Returns the most recent log containing a weight measurement.
 *
 * A missing weight is not treated as zero.
 */
export function getLatestWeightLog(
    logs: HealthLog[],
): HealthLog | undefined {
    return [...logs]
        .filter((log) => typeof log.weightKg === "number")
        .sort((a, b) => b.date.localeCompare(a.date))[0];
}

/**
 * Returns the most recent log containing a sleep measurement.
 *
 * The sleep value belongs to the date recorded in that log.
 */
export function getLatestSleepLog(
    logs: HealthLog[],
): HealthLog | undefined {
    return [...logs]
        .filter((log) => typeof log.sleepMinutes === "number")
        .sort((a, b) => b.date.localeCompare(a.date))[0];
}

/**
 * Returns actual weight measurements from the last `days`
 * calendar days, including today.
 *
 * Results are sorted from oldest to newest for chart rendering.
 */
export function getWeightTrend(
    logs: HealthLog[],
    today = new Date(),
    days = 30,
): WeightTrendPoint[] {
    if (!Number.isInteger(days) || days < 1) {
        return [];
    }

    const endDate = getTodayDateKey(today);

    const startDate = new Date(today);
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - (days - 1));

    const startDateKey = getTodayDateKey(startDate);

    return logs
        .filter(
            (
                log,
            ): log is HealthLog & { weightKg: number } =>
                typeof log.weightKg === "number" &&
                log.date >= startDateKey &&
                log.date <= endDate,
        )
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((log) => ({
            date: log.date,
            weightKg: log.weightKg,
        }));
}

/**
 * Returns the most recent health logs, newest first.
 *
 * The original array is never mutated.
 */
export function getRecentHealthLogs(
    logs: HealthLog[],
    limit = 5,
): HealthLog[] {
    if (!Number.isInteger(limit) || limit <= 0) {
        return [];
    }

    return [...logs]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, limit);
}

/**
 * Calculates today's progress against configured targets.
 *
 * Only metrics with a valid, positive target are included.
 * If a metric has not been logged today, its value and
 * percentage remain undefined and null respectively.
 */
export function getTodayHealthProgress(
    log: HealthLog | undefined,
    targets: HealthTargets | null,
): HealthProgressMetric[] {
    if (!targets) {
        return [];
    }

    const metrics = [
        {
            key: "steps",
            label: "Steps",
            value: log?.steps,
            target: targets.stepsPerDay,
            unit: "steps",
        },
        {
            key: "sleep",
            label: "Sleep",
            value: log?.sleepMinutes,
            target: targets.sleepMinutesPerDay,
            unit: "min",
        },
        {
            key: "water",
            label: "Water",
            value: log?.waterMl,
            target: targets.waterMlPerDay,
            unit: "ml",
        },
        {
            key: "calories",
            label: "Calories",
            value: log?.caloriesKcal,
            target: targets.caloriesKcalPerDay,
            unit: "kcal",
        },
        {
            key: "protein",
            label: "Protein",
            value: log?.proteinGrams,
            target: targets.proteinGramsPerDay,
            unit: "g",
        },
        {
            key: "carbs",
            label: "Carbs",
            value: log?.carbsGrams,
            target: targets.carbsGramsPerDay,
            unit: "g",
        },
        {
            key: "fiber",
            label: "Fiber",
            value: log?.fiberGrams,
            target: targets.fiberGramsPerDay,
            unit: "g",
        },
    ] as const;

    return metrics.flatMap((metric) => {
        const target = metric.target;

        // Ignore missing or invalid targets.
        if (typeof target !== "number" || target <= 0) {
            return [];
        }

        const value = metric.value;

        const percentage =
            typeof value === "number"
                ? Math.min(100, Math.round((value / target) * 100))
                : null;

        return [
            {
                ...metric,
                target,
                value,
                percentage,
            },
        ];
    });
}