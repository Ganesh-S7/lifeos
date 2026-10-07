import { MoreHorizontal } from "lucide-react";

import { Badge, Card, IconButton } from "@/components/ui";
import type { Expense } from "../../types/expense";

interface ExpensesTableProps {
    expenses: Expense[];
}

const categoryVariants = {
    Food: "success",
    Shopping: "brand",
    Transport: "info",
    Bills: "warning",
    Health: "success",
    Entertainment: "brand",
} as const;

function formatDate(date: string) {
    return new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(new Date(date));
}

function formatAmount(amount: number) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
    }).format(amount);
}

export function ExpensesTable({
    expenses,
}: ExpensesTableProps) {
    return (
        <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
                <div>
                    <h2 className="text-sm font-semibold text-text-primary">
                        Recent expenses
                    </h2>

                    <p className="mt-1 text-xs text-text-secondary">
                        {expenses.length} transactions
                    </p>
                </div>
            </div>

            {/* Desktop */}
            <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-border-subtle bg-surface-subtle">
                            <th className="px-5 py-3 text-[11px] font-medium text-text-muted">
                                Description
                            </th>

                            <th className="px-5 py-3 text-[11px] font-medium text-text-muted">
                                Category
                            </th>

                            <th className="px-5 py-3 text-[11px] font-medium text-text-muted">
                                Account
                            </th>

                            <th className="px-5 py-3 text-[11px] font-medium text-text-muted">
                                Date
                            </th>

                            <th className="px-5 py-3 text-right text-[11px] font-medium text-text-muted">
                                Amount
                            </th>

                            <th className="w-12 px-3" />
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-border-subtle">
                        {expenses.map((expense) => {
                            const variant =
                                categoryVariants[
                                expense.category as keyof typeof categoryVariants
                                ] ?? "neutral";

                            return (
                                <tr
                                    key={expense.id}
                                    className="group transition-colors hover:bg-surface-subtle"
                                >
                                    <td className="px-5 py-3.5">
                                        <div>
                                            <p className="text-xs font-medium text-text-primary">
                                                {expense.merchant}
                                            </p>

                                            {expense.note && (
                                                <p className="mt-0.5 text-[11px] text-text-muted">
                                                    {expense.note}
                                                </p>
                                            )}
                                        </div>
                                    </td>

                                    <td className="px-5 py-3.5">
                                        <Badge variant={variant}>{expense.category}</Badge>
                                    </td>

                                    <td className="px-5 py-3.5 text-xs text-text-secondary">
                                        {expense.account}
                                    </td>

                                    <td className="px-5 py-3.5 text-xs text-text-secondary">
                                        {formatDate(expense.date)}
                                    </td>

                                    <td className="px-5 py-3.5 text-right">
                                        <span className="text-xs font-semibold text-text-primary">
                                            -{formatAmount(expense.amount)}
                                        </span>
                                    </td>

                                    <td className="px-3 py-3.5">
                                        <IconButton
                                            size="sm"
                                            aria-label={`Actions for ${expense.merchant}`}
                                            className="opacity-0 transition-opacity group-hover:opacity-100"
                                        >
                                            <MoreHorizontal className="size-4" />
                                        </IconButton>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Mobile */}
            <div className="divide-y divide-border-subtle md:hidden">
                {expenses.map((expense) => {
                    const variant =
                        categoryVariants[
                        expense.category as keyof typeof categoryVariants
                        ] ?? "neutral";

                    return (
                        <div
                            key={expense.id}
                            className="flex items-center gap-3 px-5 py-4"
                        >
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-elevated text-xs font-semibold text-text-secondary">
                                {expense.merchant.charAt(0)}
                            </div>

                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium text-text-primary">
                                    {expense.merchant}
                                </p>

                                <div className="mt-1 flex items-center gap-2">
                                    <Badge variant={variant}>
                                        {expense.category}
                                    </Badge>

                                    <span className="text-[10px] text-text-muted">
                                        {formatDate(expense.date)}
                                    </span>
                                </div>
                            </div>

                            <p className="text-xs font-semibold text-text-primary">
                                -{formatAmount(expense.amount)}
                            </p>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}