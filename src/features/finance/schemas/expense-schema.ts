import { z } from "zod";

const amountSchema = z.preprocess(
    (value) => {
        if (value === "" || value === null || value === undefined) {
            return undefined;
        }

        if (typeof value === "number" && Number.isNaN(value)) {
            return undefined;
        }

        return value;
    },
    z
        .number({
            error: (issue) =>
                issue.input === undefined
                    ? "Please enter an amount."
                    : "Please enter a valid number.",
        })
        .positive("Amount must be greater than 0."),
);

export const expenseSchema = z.object({
    amount: amountSchema,

    merchant: z
        .string()
        .trim()
        .min(1, "Please enter a merchant name.")
        .max(100, "Merchant name is too long."),

    category: z
        .string()
        .min(1, "Please select a category."),

    account: z
        .string()
        .min(1, "Please select an account."),

    date: z.date({
        error: (issue) =>
            issue.input === undefined
                ? "Please select a date."
                : "Please enter a valid date.",
    }),

    note: z
        .string()
        .trim()
        .max(250, "Note must be 250 characters or less."),
});

export type ExpenseFormInput = z.input<typeof expenseSchema>;

export type ExpenseFormValues = z.output<typeof expenseSchema>;