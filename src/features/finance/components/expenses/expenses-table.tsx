import { MoreHorizontal, Pencil, Search, Trash2 } from "lucide-react";

import { Badge, Card, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, IconButton } from "@/components/ui";
import type { Expense } from "../../types/expense";
import { formatDateDisplay } from "@/lib/utils/date";
import { formatCurrency } from "@/lib/utils/currency";

interface ExpensesTableProps {
    expenses: Expense[];
    onEdit: (expense: Expense) => void;
    onDelete: (expense: Expense) => void;
}

const categoryVariants = {
    Food: "success",
    Shopping: "brand",
    Transport: "info",
    Bills: "warning",
    Health: "success",
    Entertainment: "brand",
} as const;

interface ExpenseActionsProps {
    expense: Expense;
    onEdit: (expense: Expense) => void;
    onDelete: (expense: Expense) => void;
}

function ExpenseActions({
    expense,
    onEdit,
    onDelete,
}: ExpenseActionsProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <IconButton
                    size="sm"
                    aria-label={`Actions for ${expense.merchant}`}
                >
                    <MoreHorizontal className="size-4" />
                </IconButton>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onEdit(expense)}>
                    <Pencil className="size-3.5" />
                    Edit expense
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                    onSelect={() => onDelete(expense)}
                    className="text-danger data-highlighted:text-danger"
                >
                    <Trash2 className="size-3.5" />
                    Delete expense
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function ExpensesTable({
    expenses,
    onDelete,
    onEdit,
}: ExpensesTableProps) {
    if (expenses.length === 0) {
        return (
            <Card className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
                <div className="flex size-10 items-center justify-center rounded-full bg-surface-elevated">
                    <Search className="size-4 text-text-muted" />
                </div>

                <p className="mt-4 text-sm font-medium text-text-primary">
                    No expenses found
                </p>

                <p className="mt-1 max-w-md text-xs leading-5 text-text-secondary">
                    Try changing your search or filters to find the
                    expense you&apos;re looking for.
                </p>
            </Card>
        );
    }
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
            <div className="hidden overflow-x-auto lg:block">
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
                                    className="group transition-colors hover:bg-surface-hover"
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
                                        {formatDateDisplay(expense.date)}
                                    </td>

                                    <td className="px-5 py-3.5 text-right">
                                        <span className="text-xs font-semibold text-text-primary">
                                            -{formatCurrency(expense.amount)}
                                        </span>
                                    </td>

                                    <td className="px-3 py-3.5">
                                        <ExpenseActions
                                            expense={expense}
                                            onEdit={onEdit}
                                            onDelete={onDelete}
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Mobile */}
            <div className="divide-y divide-border-subtle lg:hidden">
                {expenses.map((expense) => {
                    const variant =
                        categoryVariants[
                        expense.category as keyof typeof categoryVariants
                        ] ?? "neutral";

                    return (
                        <div
                            key={expense.id}
                            className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 px-4 py-4 sm:px-5"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="break-words text-sm font-medium text-text-primary">
                                    {expense.merchant}
                                </p>

                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <Badge variant={variant}>
                                        {expense.category}
                                    </Badge>

                                    <span className="text-xs text-text-muted">
                                        {formatDateDisplay(expense.date)}
                                    </span>
                                </div>
                                <p className="mt-1 break-words text-xs text-text-secondary">
                                    {expense.account}
                                </p>
                                {expense.note && (
                                    <p className="mt-1 break-words text-xs text-text-muted">
                                        {expense.note}
                                    </p>
                                )}
                            </div>

                            <p className="col-start-1 row-start-2 break-words text-sm font-semibold tabular-nums text-text-primary">
                                -{formatCurrency(expense.amount)}
                            </p>
                            <ExpenseActions
                                expense={expense}
                                onEdit={onEdit}
                                onDelete={onDelete}
                            />
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}