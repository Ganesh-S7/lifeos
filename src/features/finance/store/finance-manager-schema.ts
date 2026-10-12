import { z } from "zod";

export type FinanceManagerKind =
    | "account"
    | "investment"
    | "liability"
    | "transaction";

const TRANSACTION_TYPES = [
    "income",
    "transfer",
    "investment_purchase",
    "investment_sale",
] as const;

const NUMERIC_PATTERN = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * Accepts a numeric string and transforms it into a number.
 *
 * Inputs remain text fields; numeric validation happens in Zod.
 */
const numericStringSchema = z
    .string()
    .trim()
    .min(1, "Enter an amount.")
    .pipe(
        z.string().regex(
            NUMERIC_PATTERN,
            "Enter a valid numeric amount.",
        ),
    )
    .transform(Number)
    .refine(
        (value) => Number.isFinite(value),
        "Enter a valid numeric amount.",
    );

/**
 * Monthly payment is optional.
 * An empty string becomes undefined; otherwise, it becomes a number.
 */
const optionalNumericStringSchema = z
    .string()
    .trim()
    .refine(
        (value) =>
            value === "" || NUMERIC_PATTERN.test(value),
        "Enter a valid monthly payment.",
    )
    .transform((value) =>
        value === "" ? undefined : Number(value),
    )
    .refine(
        (value) =>
            value === undefined || Number.isFinite(value),
        "Enter a valid monthly payment.",
    );

const financeManagerBaseSchema = z.object({
    name: z.string().trim(),

    type: z.string().trim(),

    // Input: string. Output: number.
    amount: numericStringSchema,

    // Input: string. Output: number | undefined.
    payment: optionalNumericStringSchema,

    date: z.string().trim(),

    accountId: z.string().trim(),

    destinationId: z.string().trim(),

    investmentId: z.string().trim(),
});

function isValidDateValue(value: string): boolean {
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

export function createFinanceManagerSchema(
    kind: FinanceManagerKind,
) {
    return financeManagerBaseSchema.superRefine(
        (values, ctx) => {
            // Name or transaction description.
            if (!values.name) {
                ctx.addIssue({
                    code: "custom",
                    path: ["name"],
                    message:
                        kind === "transaction"
                            ? "Enter a description."
                            : "Enter a name.",
                });
            }

            // Investment and liability types are free-text fields.
            if (
                (kind === "investment" ||
                    kind === "liability") &&
                !values.type
            ) {
                ctx.addIssue({
                    code: "custom",
                    path: ["type"],
                    message: "Enter a type.",
                });
            }

            // Balances and valuations cannot be negative.
            if (
                kind !== "transaction" &&
                values.amount < 0
            ) {
                ctx.addIssue({
                    code: "custom",
                    path: ["amount"],
                    message: "Amount cannot be negative.",
                });
            }

            if (kind === "liability") {
                if (
                    values.payment !== undefined &&
                    values.payment < 0
                ) {
                    ctx.addIssue({
                        code: "custom",
                        path: ["payment"],
                        message:
                            "Monthly payment cannot be negative.",
                    });
                }
            }

            if (kind !== "transaction") {
                return;
            }

            // Transaction amount must be positive.
            if (values.amount <= 0) {
                ctx.addIssue({
                    code: "custom",
                    path: ["amount"],
                    message: "Amount must be greater than zero.",
                });
            }

            // Validate the selected transaction type.
            if (
                !TRANSACTION_TYPES.some(
                    (transactionType) =>
                        transactionType === values.type,
                )
            ) {
                ctx.addIssue({
                    code: "custom",
                    path: ["type"],
                    message: "Select a valid transaction type.",
                });
            }

            if (!values.accountId) {
                ctx.addIssue({
                    code: "custom",
                    path: ["accountId"],
                    message: "Select an account.",
                });
            }

            // Transaction dates must be valid calendar dates.
            if (!isValidDateValue(values.date)) {
                ctx.addIssue({
                    code: "custom",
                    path: ["date"],
                    message: "Select a valid transaction date.",
                });
            }

            // Transfers require a different destination account.
            if (values.type === "transfer") {
                if (!values.destinationId) {
                    ctx.addIssue({
                        code: "custom",
                        path: ["destinationId"],
                        message: "Select a destination account.",
                    });
                } else if (
                    values.destinationId === values.accountId
                ) {
                    ctx.addIssue({
                        code: "custom",
                        path: ["destinationId"],
                        message:
                            "Choose a different destination account.",
                    });
                }
            }

            // Investment purchases and sales require an investment.
            if (
                values.type === "investment_purchase" ||
                values.type === "investment_sale"
            ) {
                if (!values.investmentId) {
                    ctx.addIssue({
                        code: "custom",
                        path: ["investmentId"],
                        message: "Select an investment.",
                    });
                }
            }
        },
    );
}

export type FinanceManagerFormInput = z.input<
    typeof financeManagerBaseSchema
>;

export type FinanceManagerFormValues = z.output<
    typeof financeManagerBaseSchema
>;