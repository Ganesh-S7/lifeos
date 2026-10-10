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
import { formatDateValue } from "@/lib/utils/date";

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
    const [date, setDate] = useState<Date | null>(null);
    const [addExpenseOpen, setAddExpenseOpen] = useState(false);

    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("all");
    const [sort, setSort] = useState<ExpenseSort>("date-desc");

    const handleAddExpense = (data: ExpenseFormValues) => {
        const newExpense: Expense = {
            id: crypto.randomUUID(),
            merchant: data.merchant,
            category: data.category,
            account: data.account,
            amount: data.amount,
            date: formatDateValue(data.date),
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
                    expense.account,
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
    }, [expenses, search, category, date, sort]);

    return (
        <div className="space-y-6">
            <ExpensesHeader
                onAddExpense={() => setAddExpenseOpen(true)}
            />

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

            <ExpensesTable expenses={filteredExpenses} />

            <AddExpenseDialog
                open={addExpenseOpen}
                onOpenChange={setAddExpenseOpen}
                onSubmit={handleAddExpense}
            />
        </div>
    );
}