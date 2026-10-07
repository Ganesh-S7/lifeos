"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
} from "@/components/ui";

import {
    expenseSchema,
    type ExpenseFormValues,
} from "../../schemas/expense-schema";

interface AddExpenseDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: ExpenseFormValues) => void;
}

const categories = [
    "Food",
    "Shopping",
    "Transport",
    "Bills",
    "Health",
    "Entertainment",
    "Other",
];

const accounts = [
    "Primary Account",
    "Wallet",
    "Savings",
];

function getTodayValue() {
    const today = new Date();

    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

export function AddExpenseDialog({
    open,
    onOpenChange,
    onSubmit,
}: AddExpenseDialogProps) {
    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<ExpenseFormValues>({
        resolver: zodResolver(expenseSchema),
        defaultValues: {
            amount: undefined,
            merchant: "",
            category: "",
            account: "Primary Account",
            date: getTodayValue(),
            note: "",
        },
    });

    const handleFormSubmit = (data: ExpenseFormValues) => {
        onSubmit(data);

        reset({
            amount: undefined,
            merchant: "",
            category: "",
            account: "Primary Account",
            date: getTodayValue(),
            note: "",
        });

        onOpenChange(false);
    };

    const handleCancel = () => {
        reset();
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-130">
                <DialogHeader>
                    <DialogTitle>Add expense</DialogTitle>

                    <DialogDescription>
                        Record an expense and keep your financial picture up to date.
                    </DialogDescription>
                </DialogHeader>

                <form
                    onSubmit={handleSubmit(handleFormSubmit)}
                    className="mt-6 space-y-5"
                >
                    {/* Amount */}
                    <div className="space-y-2">
                        <label
                            htmlFor="amount"
                            className="text-xs font-medium text-text-primary"
                        >
                            Amount
                        </label>

                        <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-secondary">
                                ₹
                            </span>

                            <Input
                                id="amount"
                                placeholder="0.00"
                                className="pl-8"
                                {...register("amount", {
                                    valueAsNumber: true,
                                })}
                            />
                        </div>

                        {errors.amount && (
                            <p className="text-xs text-danger">
                                {errors.amount.message}
                            </p>
                        )}
                    </div>

                    {/* Merchant */}
                    <div className="space-y-2">
                        <label
                            htmlFor="merchant"
                            className="text-xs font-medium text-text-primary"
                        >
                            Merchant
                        </label>

                        <Input
                            id="merchant"
                            placeholder="e.g. Swiggy, Amazon, Uber"
                            {...register("merchant")}
                        />

                        {errors.merchant && (
                            <p className="text-xs text-danger">
                                {errors.merchant.message}
                            </p>
                        )}
                    </div>

                    {/* Category + Account */}
                    <div className="grid gap-5 sm:grid-cols-2">
                        <div className="space-y-2">
                            <label
                                htmlFor="category"
                                className="text-xs font-medium text-text-primary"
                            >
                                Category
                            </label>

                            <select
                                id="category"
                                {...register("category")}
                                className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                            >
                                <option value="">Select category</option>

                                {categories.map((category) => (
                                    <option key={category} value={category}>
                                        {category}
                                    </option>
                                ))}
                            </select>

                            {errors.category && (
                                <p className="text-xs text-danger">
                                    {errors.category.message}
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label
                                htmlFor="account"
                                className="text-xs font-medium text-text-primary"
                            >
                                Account
                            </label>

                            <select
                                id="account"
                                {...register("account")}
                                className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                            >
                                {accounts.map((account) => (
                                    <option key={account} value={account}>
                                        {account}
                                    </option>
                                ))}
                            </select>

                            {errors.account && (
                                <p className="text-xs text-danger">
                                    {errors.account.message}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Date */}
                    <div className="space-y-2">
                        <label
                            htmlFor="date"
                            className="text-xs font-medium text-text-primary"
                        >
                            Date
                        </label>

                        <Input
                            id="date"
                            type="date"
                            {...register("date")}
                        />

                        {errors.date && (
                            <p className="text-xs text-danger">
                                {errors.date.message}
                            </p>
                        )}
                    </div>

                    {/* Note */}
                    <div className="space-y-2">
                        <label
                            htmlFor="note"
                            className="text-xs font-medium text-text-primary"
                        >
                            Note
                            <span className="ml-1 font-normal text-text-muted">
                                (optional)
                            </span>
                        </label>

                        <textarea
                            id="note"
                            rows={3}
                            placeholder="Add a note..."
                            {...register("note")}
                            className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
                        />

                        {errors.note && (
                            <p className="text-xs text-danger">
                                {errors.note.message}
                            </p>
                        )}
                    </div>

                    <DialogFooter className="mt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleCancel}
                        >
                            Cancel
                        </Button>

                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? "Saving..." : "Add expense"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}