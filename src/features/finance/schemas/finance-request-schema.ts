import { z } from "zod";

/**
 * Transport guard for numeric DTOs backed by DECIMAL(18, 2).
 * Reject unsupported precision instead of choosing a rounding policy.
 * This does not change the existing store or its arithmetic.
 */
export const financeMoneySchema = z.number().finite().refine(
    (value) => {
        const minorUnits = Math.round(value * 100);
        return Number.isSafeInteger(minorUnits) && minorUnits / 100 === value;
    },
    "Use at most two decimal places within the supported numeric range.",
);

const nonNegativeMoneySchema = financeMoneySchema.nonnegative();
const positiveMoneySchema = financeMoneySchema.positive();
const nameSchema = z.string().trim().min(1).max(100);
const referenceSchema = z.string().trim().min(1).max(191);
const optionalTextSchema = z.string().trim().max(250).nullish()
    .transform((value) => value ?? undefined);

export const financeDateOnlySchema = z.string().refine(
    (value) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const year = Number(value.slice(0, 4));
        if (year < 1000 || year > 9999) return false;
        const date = new Date(`${value}T00:00:00.000Z`);
        return Number.isFinite(date.getTime()) &&
            date.toISOString().slice(0, 10) === value;
    },
    "Enter a valid calendar date in YYYY-MM-DD format within MySQL's date range.",
);

/** IDs belong in future route params, not in create/update bodies. */
export const financeRecordParamsSchema = z.strictObject({
    id: referenceSchema,
});

/** Full replacement of editable fields; the server supplies snapshot time. */
export const bankAccountRequestSchema = z.strictObject({
    name: nameSchema,
    balance: nonNegativeMoneySchema,
});

export const investmentRequestSchema = z.strictObject({
    name: nameSchema,
    type: nameSchema,
    value: nonNegativeMoneySchema,
});

export const liabilityRequestSchema = z.strictObject({
    name: nameSchema,
    type: nameSchema,
    balance: nonNegativeMoneySchema,
    monthlyPayment: nonNegativeMoneySchema.nullish()
        .transform((value) => value ?? undefined),
});

const transactionFields = {
    amount: positiveMoneySchema,
    description: nameSchema,
    date: financeDateOnlySchema,
    accountId: referenceSchema,
    note: optionalTextSchema,
};

const incomeRequestSchema = z.strictObject({
    ...transactionFields,
    type: z.literal("income"),
    category: nameSchema.nullish().transform((value) => value ?? undefined),
});

const expenseRequestSchema = z.strictObject({
    ...transactionFields,
    type: z.literal("expense"),
    category: nameSchema,
});

const transferRequestSchema = z.strictObject({
    ...transactionFields,
    type: z.literal("transfer"),
    destinationAccountId: referenceSchema,
});

const investmentPurchaseRequestSchema = z.strictObject({
    ...transactionFields,
    type: z.literal("investment_purchase"),
    investmentId: referenceSchema,
});

const investmentSaleRequestSchema = z.strictObject({
    ...transactionFields,
    type: z.literal("investment_sale"),
    investmentId: referenceSchema,
});

/** Syntax only: ownership, available funds, and ledger validation need DB state. */
export const financeTransactionRequestSchema = z.discriminatedUnion("type", [
    incomeRequestSchema,
    expenseRequestSchema,
    transferRequestSchema,
    investmentPurchaseRequestSchema,
    investmentSaleRequestSchema,
]).superRefine((transaction, context) => {
    if (transaction.type === "transfer" &&
        transaction.accountId === transaction.destinationAccountId) {
        context.addIssue({
            code: "custom",
            path: ["destinationAccountId"],
            message: "Choose a different destination account.",
        });
    }
});

/** History is server-derived. There is deliberately no client snapshot write body. */
export const financeHistoryQuerySchema = z.strictObject({
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
}).superRefine((query, context) => {
    if (query.from && query.to && Date.parse(query.from) > Date.parse(query.to)) {
        context.addIssue({
            code: "custom",
            path: ["to"],
            message: "The end of the history range must not precede its start.",
        });
    }
});

export type BankAccountRequest = z.output<typeof bankAccountRequestSchema>;
export type InvestmentRequest = z.output<typeof investmentRequestSchema>;
export type LiabilityRequest = z.output<typeof liabilityRequestSchema>;
export type FinanceTransactionRequest = z.output<typeof financeTransactionRequestSchema>;
export type FinanceHistoryQuery = z.output<typeof financeHistoryQuerySchema>;
