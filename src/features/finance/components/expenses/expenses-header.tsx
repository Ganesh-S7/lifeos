import { Plus } from "lucide-react";
import { Button } from "@/components/ui";

interface ExpensesHeaderProps {
    onAddExpense?: () => void;
    disabled?: boolean;
}

export function ExpensesHeader({
    onAddExpense,
    disabled,
}: ExpensesHeaderProps) {
    return (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-text-primary lg:text-3xl">
                    Expenses
                </h1>

                <p className="mt-1.5 text-sm text-text-secondary">
                    Track where your money goes and understand your spending habits.
                </p>
            </div>

            <Button onClick={onAddExpense} disabled={disabled}>
                <Plus className="size-4" />
                Add expense
            </Button>
        </div>
    );
}
