"use client";

import { useState } from "react";

import { mockExpenses } from "@/features/finance/data/mock-expenses";
import { ExpensesHeader, ExpensesSummary, ExpensesToolbar, ExpensesTable } from "@/features/finance";

export default function ExpensesPage() {
    const [addExpenseOpen, setAddExpenseOpen] = useState(false);

    return (
        <div className="space-y-6">
            <ExpensesHeader
                onAddExpense={() => setAddExpenseOpen(true)}
            />

            <ExpensesSummary />

            <ExpensesToolbar />

            <ExpensesTable expenses={mockExpenses} />

            {addExpenseOpen && (
                <div>
                    {/* Add Expense dialog comes next */}
                </div>
            )}
        </div>
    );
}