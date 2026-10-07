"use client";

import { useState } from "react";

import { mockExpenses } from "@/features/finance/data/mock-expenses";
import {
    ExpensesHeader,
    ExpensesSummary,
    ExpensesToolbar,
    ExpensesTable,
    AddExpenseDialog,
    Expense,
    ExpenseFormValues
} from "@/features/finance";

export default function ExpensesPage() {
    const [expenses, setExpenses] = useState<Expense[]>(mockExpenses);
    const [addExpenseOpen, setAddExpenseOpen] = useState(false);

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

    return (
        <div className="space-y-6">
            <ExpensesHeader
                onAddExpense={() => setAddExpenseOpen(true)}
            />

            <ExpensesSummary />

            <ExpensesToolbar />

            <ExpensesTable expenses={expenses} />

            <AddExpenseDialog
                open={addExpenseOpen}
                onOpenChange={setAddExpenseOpen}
                onSubmit={handleAddExpense}
            />
        </div>
    );
}