export interface HealthLog {
    id: string;

    /**
     * Local calendar date in YYYY-MM-DD format.
     * There should be at most one daily log per date.
     */
    date: string;

    // Body and activity
    weightKg?: number;
    steps?: number;
    sleepMinutes?: number;

    // Nutrition and hydration
    waterMl?: number;
    caloriesKcal?: number;
    proteinGrams?: number;
    carbsGrams?: number;
    fiberGrams?: number;

    createdAt: string;
    updatedAt: string;
}

export interface HealthTargets {
    // Body
    weightGoalKg?: number;

    // Activity
    stepsPerDay?: number;
    sleepMinutesPerDay?: number;

    // Nutrition and hydration
    waterMlPerDay?: number;
    caloriesKcalPerDay?: number;
    proteinGramsPerDay?: number;
    carbsGramsPerDay?: number;
    fiberGramsPerDay?: number;

    updatedAt: string;
}

export type HealthProgressMetric = {
    key: string;
    label: string;
    value: number | undefined;
    target: number;
    unit: string;
    percentage: number | null;
};

export interface HealthAnalyticsPoint {
    date: string;
    weightKg?: number;
    steps?: number;
    sleepHours?: number;
    waterLitres?: number;
    caloriesKcal?: number;
    proteinGrams?: number;
    carbsGrams?: number;
    fiberGrams?: number;
}