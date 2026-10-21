import type { HealthLog } from "../types/health";

const numberFormatter = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 1,
});

const integerFormatter = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
});

export function formatHealthNumber(value: number): string {
    return numberFormatter.format(value);
}

export function formatHealthInteger(value: number): string {
    return integerFormatter.format(value);
}

export function formatHealthDuration(minutes: number): string {
    const totalMinutes = Math.round(minutes);
    const hours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;

    if (hours === 0) {
        return `${remainingMinutes}m`;
    }

    if (remainingMinutes === 0) {
        return `${hours}h`;
    }

    return `${hours}h ${remainingMinutes}m`;
}

export function formatProgressValue(
    value: number,
    key: string,
): string {
    switch (key) {
        case "steps":
            return `${formatHealthInteger(value)} steps`;

        case "sleep":
            return formatHealthDuration(value);

        case "water":
            return `${formatHealthNumber(value / 1000)} L`;

        case "calories":
            return `${formatHealthInteger(value)} kcal`;

        case "protein":
        case "carbs":
        case "fiber":
            return `${formatHealthNumber(value)} g`;

        default:
            return formatHealthNumber(value);
    }
}

export function getHealthLogSummary(log: HealthLog): string[] {
    const details: string[] = [];

    if (log.weightKg !== undefined) {
        details.push(
            `Weight: ${formatHealthNumber(log.weightKg)} kg`,
        );
    }

    if (log.steps !== undefined) {
        details.push(
            `Steps: ${formatHealthInteger(log.steps)}`,
        );
    }

    if (log.sleepMinutes !== undefined) {
        details.push(
            `Sleep: ${formatHealthDuration(log.sleepMinutes)}`,
        );
    }

    if (log.waterMl !== undefined) {
        details.push(
            `Water: ${formatHealthNumber(log.waterMl / 1000)} L`,
        );
    }

    if (log.caloriesKcal !== undefined) {
        details.push(
            `Calories: ${formatHealthInteger(log.caloriesKcal)} kcal`,
        );
    }

    if (log.proteinGrams !== undefined) {
        details.push(
            `Protein: ${formatHealthNumber(log.proteinGrams)} g`,
        );
    }

    if (log.carbsGrams !== undefined) {
        details.push(
            `Carbs: ${formatHealthNumber(log.carbsGrams)} g`,
        );
    }

    if (log.fiberGrams !== undefined) {
        details.push(
            `Fiber: ${formatHealthNumber(log.fiberGrams)} g`,
        );
    }

    return details;
}