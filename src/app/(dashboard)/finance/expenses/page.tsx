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

import { mockExpenses } from "@/features/finance/data/mock-expenses";
import type { Expense } from "@/features/finance/types/expense";
import type { ExpenseFormValues } from "@/features/finance/schemas/expense-schema";

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
    const [expenses, setExpenses] = useState<Expense[]>(mockExpenses);

    const [addExpenseOpen, setAddExpenseOpen] = useState(false);

    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("all");
    const [sort, setSort] = useState<ExpenseSort>("date-desc");

    const filteredExpenses = useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase();

        return [...expenses]
            .filter((expense) => {
                if (!normalizedSearch) {
                    return true;
                }

                return [
                    expense.merchant,
                    expense.category,
                    expense.account,
                    expense.note ?? "",
                ].some((value) =>
                    value.toLowerCase().includes(normalizedSearch)
                );
            })
            .filter((expense) => {
                if (!category || category === "all") {
                    return true;
                }

                return expense.category === category;
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
    }, [expenses, search, category, sort]);

    const handleAddExpense = (data: ExpenseFormValues) => {
        const newExpense: Expense = {
            id: crypto.randomUUID(),
            merchant: data.merchant,
            category: data.category,
            account: data.account,
            amount: data.amount,
            date: data.date,
            note: data.note || undefined,
        };

        setExpenses((currentExpenses) => [
            newExpense,
            ...currentExpenses,
        ]);
    };

    const handleResetFilters = () => {
        setSearch("");
        setCategory("all");
        setSort("date-desc");
    };

    return (
        <div className="space-y-6">
            <ExpensesHeader
                onAddExpense={() => setAddExpenseOpen(true)}
            />

            <ExpensesSummary />

            <ExpensesToolbar
                search={search}
                category={category}
                sort={sort}
                categories={categories}
                onSearchChange={setSearch}
                onCategoryChange={setCategory}
                onSortChange={setSort}
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

            <ExpensesTable expenses={filteredExpenses} />

            <AddExpenseDialog
                open={addExpenseOpen}
                onOpenChange={setAddExpenseOpen}
                onSubmit={handleAddExpense}
            />
        </div>
    );
}