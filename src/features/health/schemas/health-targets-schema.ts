import { z } from "zod";

/**
 * Reuse the same numeric validation rules as the daily log.
 * Target measurements have their own stricter positive-value rules.
 */
const targetInputSchema = z.object({
    weightGoalKg: z
        .string()
        .trim()
        .refine(
            (value) =>
                value === "" ||
                /^\d+(?:\.\d*)?$/.test(value),
            "Weight goal must be a valid number.",
        )
        .transform((value) =>
            value === "" ? undefined : Number(value),
        )
        .refine(
            (value) =>
                value === undefined ||
                (Number.isFinite(value) && value > 0),
            "Weight goal must be greater than zero.",
        ),

    stepsPerDay: z
        .string()
        .trim()
        .refine(
            (value) =>
                value === "" || /^\d+$/.test(value),
            "Steps target must be a whole number.",
        )
        .transform((value) =>
            value === "" ? undefined : Number(value),
        )
        .refine(
            (value) =>
                value === undefined ||
                (Number.isSafeInteger(value) && value > 0),
            "Steps target must be greater than zero.",
        ),

    sleepHoursPerDay: z
        .string()
        .trim()
        .refine(
            (value) =>
                value === "" ||
                /^\d+(?:\.\d*)?$/.test(value),
            "Sleep target must be a valid number.",
        )
        .transform((value) =>
            value === "" ? undefined : Number(value),
        )
        .refine(
            (value) =>
                value === undefined ||
                (Number.isFinite(value) &&
                    value > 0 &&
                    value <= 24),
            "Sleep target must be between 0 and 24 hours.",
        ),

    waterLitresPerDay: z
        .string()
        .trim()
        .refine(
            (value) =>
                value === "" ||
                /^\d+(?:\.\d*)?$/.test(value),
            "Water target must be a valid number.",
        )
        .transform((value) =>
            value === "" ? undefined : Number(value),
        )
        .refine(
            (value) =>
                value === undefined ||
                (Number.isFinite(value) && value > 0),
            "Water target must be greater than zero.",
        ),

    caloriesKcalPerDay: z
        .string()
        .trim()
        .refine(
            (value) =>
                value === "" || /^\d+$/.test(value),
            "Calories target must be a whole number.",
        )
        .transform((value) =>
            value === "" ? undefined : Number(value),
        )
        .refine(
            (value) =>
                value === undefined ||
                (Number.isSafeInteger(value) && value > 0),
            "Calories target must be greater than zero.",
        ),

    proteinGramsPerDay: z
        .string()
        .trim()
        .refine(
            (value) =>
                value === "" ||
                /^\d+(?:\.\d*)?$/.test(value),
            "Protein target must be a valid number.",
        )
        .transform((value) =>
            value === "" ? undefined : Number(value),
        )
        .refine(
            (value) =>
                value === undefined ||
                (Number.isFinite(value) && value > 0),
            "Protein target must be greater than zero.",
        ),

    carbsGramsPerDay: z
        .string()
        .trim()
        .refine(
            (value) =>
                value === "" ||
                /^\d+(?:\.\d*)?$/.test(value),
            "Carbohydrates target must be a valid number.",
        )
        .transform((value) =>
            value === "" ? undefined : Number(value),
        )
        .refine(
            (value) =>
                value === undefined ||
                (Number.isFinite(value) && value > 0),
            "Carbohydrates target must be greater than zero.",
        ),

    fiberGramsPerDay: z
        .string()
        .trim()
        .refine(
            (value) =>
                value === "" ||
                /^\d+(?:\.\d*)?$/.test(value),
            "Fiber target must be a valid number.",
        )
        .transform((value) =>
            value === "" ? undefined : Number(value),
        )
        .refine(
            (value) =>
                value === undefined ||
                (Number.isFinite(value) && value > 0),
            "Fiber target must be greater than zero.",
        ),
});

export const healthTargetsSchema =
    targetInputSchema.transform((values) => ({
        weightGoalKg: values.weightGoalKg,
        stepsPerDay: values.stepsPerDay,

        sleepMinutesPerDay:
            values.sleepHoursPerDay === undefined
                ? undefined
                : Math.round(values.sleepHoursPerDay * 60),

        waterMlPerDay:
            values.waterLitresPerDay === undefined
                ? undefined
                : Math.round(values.waterLitresPerDay * 1000),

        caloriesKcalPerDay: values.caloriesKcalPerDay,
        proteinGramsPerDay: values.proteinGramsPerDay,
        carbsGramsPerDay: values.carbsGramsPerDay,
        fiberGramsPerDay: values.fiberGramsPerDay,
    }));

export type HealthTargetsFormInput = z.input<
    typeof healthTargetsSchema
>;

export type HealthTargetsFormValues = z.output<
    typeof healthTargetsSchema
>;