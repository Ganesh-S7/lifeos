import type { Expense } from "../types/expense";
import type { FinanceTransaction } from "../types/finance";

/** Keep account IDs in the editable model; resolve display names only at the table boundary. */
export function transactionsToExpenses(transactions: FinanceTransaction[]): Expense[] {
    return transactions
        .filter((transaction) => transaction.type === "expense")
        .map((transaction) => ({
            id: transaction.id,
            merchant: transaction.description,
            category: transaction.category || "Other",
            account: transaction.accountId || "",
            amount: transaction.amount,
            date: transaction.date,
            note: transaction.note,
        }));
}

export function expenseToTransaction(expense: Omit<Expense, "id"> & { id?: string }) {
    return {
        id: expense.id || undefined,
        type: "expense" as const,
        amount: expense.amount,
        description: expense.merchant,
        category: expense.category,
        accountId: expense.account,
        date: expense.date,
        note: expense.note || undefined,
    };
}
