"use client";

import { useMemo, useState } from "react";

import { AddExpenseDialog } from "@/features/finance/components/expenses/add-expense-dialog";
import { ExpensesHeader } from "@/features/finance/components/expenses/expenses-header";
import { ExpensesSummary } from "@/features/finance/components/expenses/expenses-summary";
import {
    ExpensesToolbar,
    type ExpenseSort,
} from "@/features/finance/components/expenses/expenses-toolbar";
import { ExpensesTable } from "@/features/finance/components/expenses/expenses-table";
import { ExpensesSkeleton } from "@/features/finance/components/expenses/expenses-skeleton";
import { useFinanceMutation } from "@/features/finance/hooks/use-finance-mutation";
import type { FinanceMutationCallback } from "@/features/finance/utils/finance-mutation";
import { notify } from "@/lib/notifications";

import { FinanceRefreshNotice } from "@/features/finance/components/finance-refresh-notice";
import { expenseToTransaction, transactionsToExpenses } from "@/features/finance/utils/expense-transactions";
import type { Expense } from "@/features/finance/types/expense";
import type { ExpenseFormValues } from "@/features/finance/schemas/expense-schema";
import { formatDateValue } from "@/lib/utils/date";
import { DeleteModal, LoadError } from "@/components/ui";
import Link from "next/link";
import { financeActions, useFinance } from "@/features/finance/store/finance-store";

const categories = [
    "Food",
    "Shopping",
    "Transport",
    "Bills",
    "Health",
    "Entertainment",
    "Other",
];

export default function ExpensesPage() {
    const { userId } = useFinance();
    return <ExpensesPageContent key={userId ?? "signed-out"} />;
}

function ExpensesPageContent() {
    const { data, ready, loadError, refreshError, refreshing, retry } = useFinance();
    const [error, setError] = useState("");
    const deletion = useFinanceMutation();
    const expenses = transactionsToExpenses(data.transactions);
    const [date, setDate] = useState<Date | null>(null);
    const [addExpenseOpen, setAddExpenseOpen] = useState(false);

    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("all");
    const [sort, setSort] = useState<ExpenseSort>("date-desc");
    const [editingExpense, setEditingExpense] =
        useState<Expense | null>(null);
    const [expenseToDelete, setExpenseToDelete] =
        useState<Expense | null>(null);

    const handleSaveExpense: FinanceMutationCallback<ExpenseFormValues> = async (data) => {
        try {
            await financeActions.saveTransaction(
                expenseToTransaction({
                    id: editingExpense?.id,
                    amount: data.amount,
                    merchant: data.merchant,
                    category: data.category,
                    account: data.account,
                    date: formatDateValue(data.date),
                    note: data.note || undefined,
                }),
            );
            setError("");
            notify.success(editingExpense ? "Expense updated." : "Expense saved.");
            return true;
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not save expense.");
            notify.error("Unable to save this expense.", {
                description: "Review the form and account balance, then try again.",
            });
            return false;
        }
    };

    const handleEditExpense = (expense: Expense) => {
        const original = data.transactions.find((transaction) => transaction.id === expense.id);
        setEditingExpense({ ...expense, account: original?.accountId || "" });
        setAddExpenseOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!expenseToDelete) return;

        return deletion.run(async () => {
            await financeActions.deleteTransaction(expenseToDelete.id);
            return true;
        }, {
            onSuccess: () => {
                setError("");
                notify.success("Expense deleted.");
                setExpenseToDelete(null);
            },
            onError: (cause) => {
                setError(cause instanceof Error ? cause.message : "Could not delete expense.");
                notify.error("Unable to delete this expense. Please try again.");
            },
        });
    };

    const handleResetFilters = () => {
        setSearch("");
        setCategory("all");
        setSort("date-desc");
        setDate(null);
    };

    const filteredExpenses = useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase();
        const selectedDate = date ? formatDateValue(date) : null;

        return [...expenses]
            .filter((expense) => {
                if (!normalizedSearch) {
                    return true;
                }

                return [
                    expense.merchant,
                    expense.category,
                    data.accounts.find((account) => account.id === expense.account)?.name || "",
                    expense.note ?? "",
                ].some((value) =>
                    value.toLowerCase().includes(normalizedSearch),
                );
            })
            .filter((expense) => {
                if (category === "all" || !category) {
                    return true;
                }

                return expense.category === category;
            })
            .filter((expense) => {
                if (!selectedDate) {
                    return true;
                }

                return expense.date === selectedDate;
            })
            .sort((a, b) => {
                switch (sort) {
                    case "date-asc":
                        return a.date.localeCompare(b.date);

                    case "amount-desc":
                        return b.amount - a.amount;

                    case "amount-asc":
                        return a.amount - b.amount;

                    case "date-desc":
                    default:
                        return b.date.localeCompare(a.date);
                }
            });
    }, [expenses, data.accounts, search, category, date, sort]);

    return (
        <div className="space-y-6">
            <ExpensesHeader
                onAddExpense={() => setAddExpenseOpen(true)}
                disabled={!ready || data.accounts.length === 0}
            />
            {!ready ? (
                loadError ? <LoadError message={loadError} onRetry={retry} /> : <ExpensesSkeleton />
            ) : (
                <>
                    <FinanceRefreshNotice
                        message={refreshError}
                        refreshing={refreshing}
                        onRetry={retry}
                    />
                    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
                    {data.accounts.length === 0 && (
                        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary">
                            Add a bank account before recording expenses. {" "}
                            <Link href="/finance" className="text-primary underline">Manage accounts</Link>
                        </p>
                    )}

                    <ExpensesSummary expenses={expenses} />

                    <ExpensesToolbar
                        search={search}
                        category={category}
                        sort={sort}
                        date={date}
                        categories={categories}
                        onSearchChange={setSearch}
                        onCategoryChange={setCategory}
                        onSortChange={setSort}
                        onDateChange={setDate}
                        onReset={handleResetFilters}
                    />

                    <div className="flex items-center justify-between">
                        <p className="text-xs text-text-secondary">
                            Showing{" "}
                            <span className="font-medium text-text-primary">
                                {filteredExpenses.length}
                            </span>{" "}
                            of{" "}
                            <span className="font-medium text-text-primary">
                                {expenses.length}
                            </span>{" "}
                            expenses
                        </p>
                    </div>

                    <ExpensesTable
                        expenses={filteredExpenses.map((expense) => ({
                            ...expense,
                            account: data.accounts.find((account) => account.id === expense.account)?.name ||
                                "Account unavailable",
                        }))}
                        onEdit={handleEditExpense}
                        onDelete={setExpenseToDelete}
                    />

                </>
            )}
            <AddExpenseDialog
                open={ready && addExpenseOpen}
                onOpenChange={(open) => {
                    setAddExpenseOpen(open);

                    if (!open) {
                        setEditingExpense(null);
                    }
                }}
                expense={editingExpense}
                accounts={data.accounts.map((account) => ({ label: account.name, value: account.id }))}
                error={error}
                onSubmit={handleSaveExpense}
            />
            <DeleteModal
                open={ready && expenseToDelete !== null}
                onOpenChange={(open) => {
                    if (!open && !deletion.isPending()) {
                        setExpenseToDelete(null);
                    }
                }}
                title="Delete expense?"
                description={
                    error || (expenseToDelete ? (
                        <>
                            Are you sure you want to delete{" "}
                            <span className="font-medium text-text-primary">
                                {expenseToDelete.merchant}
                            </span>
                            ? This action cannot be undone.
                        </>
                    ) : (
                        "This expense will be permanently removed."
                    ))
                }
                isLoading={deletion.isPendingState}
                confirmText="Delete expense"
                onConfirm={handleConfirmDelete}
            />
        </div>
    );
}
