import { z } from "zod";

import { formatDateValue } from "@/lib/utils/date";

const numericPattern = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

interface NumericFieldOptions {
    label: string;
    min?: number;
    max?: number;
    integer?: boolean;
    exclusiveMin?: boolean;
}

/**
 * Validates a numeric text input.
 *
 * An empty string becomes undefined because the measurement
 * was not recorded.
 */
function optionalNumericField({
    label,
    min = 0,
    max,
    integer = false,
    exclusiveMin = false,
}: NumericFieldOptions) {
    return z
        .string()
        .trim()
        .refine(
            (value) =>
                value === "" || numericPattern.test(value),
            `${label} must be a valid number.`,
        )
        .transform((value) =>
            value === "" ? undefined : Number(value),
        )
        .refine(
            (value) =>
                value === undefined || Number.isFinite(value),
            `${label} must be a valid number.`,
        )
        .refine(
            (value) =>
                value === undefined ||
                (exclusiveMin ? value > min : value >= min),
            exclusiveMin
                ? `${label} must be greater than ${min}.`
                : `${label} cannot be less than ${min}.`,
        )
        .refine(
            (value) =>
                value === undefined ||
                max === undefined ||
                value <= max,
            `${label} cannot exceed ${max}.`,
        )
        .refine(
            (value) =>
                value === undefined ||
                !integer ||
                Number.isSafeInteger(value),
            `${label} must be a whole number.`,
        );
}

function isValidCalendarDate(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) {
        return false;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const date = new Date(year, month - 1, day);

    return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
}

const baseHealthLogSchema = z.object({
    date: z.string().trim().min(1, "Select a date."),

    weightKg: optionalNumericField({
        label: "Weight",
        min: 0,
        exclusiveMin: true,
    }),

    steps: optionalNumericField({
        label: "Steps",
        integer: true,
    }),

    sleepHours: optionalNumericField({
        label: "Sleep duration",
        max: 24,
    }),

    waterLitres: optionalNumericField({
        label: "Water intake",
    }),

    caloriesKcal: optionalNumericField({
        label: "Calories",
        integer: true,
    }),

    proteinGrams: optionalNumericField({
        label: "Protein",
    }),

    carbsGrams: optionalNumericField({
        label: "Carbohydrates",
    }),

    fiberGrams: optionalNumericField({
        label: "Fiber",
    }),
});

export function createHealthLogSchema(
    today = formatDateValue(new Date()),
) {
    return baseHealthLogSchema
        .superRefine((values, ctx) => {
            if (!values.date) {
                return;
            }

            if (!isValidCalendarDate(values.date)) {
                ctx.addIssue({
                    code: "custom",
                    path: ["date"],
                    message: "Enter a valid calendar date.",
                });

                return;
            }

            if (values.date > today) {
                ctx.addIssue({
                    code: "custom",
                    path: ["date"],
                    message: "Future dates are not allowed.",
                });
            }
        })
        .transform((values) => ({
            date: values.date,
            weightKg: values.weightKg,
            steps: values.steps,

            sleepMinutes:
                values.sleepHours === undefined
                    ? undefined
                    : Math.round(values.sleepHours * 60),

            waterMl:
                values.waterLitres === undefined
                    ? undefined
                    : Math.round(values.waterLitres * 1000),

            caloriesKcal: values.caloriesKcal,
            proteinGrams: values.proteinGrams,
            carbsGrams: values.carbsGrams,
            fiberGrams: values.fiberGrams,
        }));
}

export type HealthLogFormInput = z.input<
    ReturnType<typeof createHealthLogSchema>
>;

export type HealthLogFormValues = z.output<
    ReturnType<typeof createHealthLogSchema>
>;