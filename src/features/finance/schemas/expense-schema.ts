import { z } from "zod";

export const expenseSchema = z.object({
    amount: z
        .number()
        .positive("Amount must be greater than 0"),

    merchant: z
        .string()
        .trim()
        .min(1, "Merchant is required")
        .max(100, "Merchant must be 100 characters or less"),

    category: z
        .string()
        .min(1, "Category is required"),

    account: z
        .string()
        .min(1, "Account is required"),

    date: z
        .string()
        .min(1, "Date is required"),

    note: z
        .string()
        .trim()
        .max(250, "Note must be 250 characters or less"),
});

export type ExpenseFormValues = z.infer<typeof expenseSchema>;