import { z } from "zod";
import { cleanCategoryName } from "../utils/expense-categories";

export const expenseCategoryNameSchema = z.string()
    .max(300, "Category name is too long.")
    .transform(cleanCategoryName)
    .pipe(z.string()
        .refine((name) => !/[\p{Cc}\p{Cf}]/u.test(name), "Use a category name without control characters.")
        .min(1, "Enter a category name.")
        .max(100, "Use 100 characters or fewer."));

export const expenseCategoryRequestSchema = z.strictObject({
    name: expenseCategoryNameSchema,
});

export type ExpenseCategoryRequest = z.input<typeof expenseCategoryRequestSchema>;

export interface ExpenseCategory {
    id: string | null;
    name: string;
    builtIn: boolean;
}
