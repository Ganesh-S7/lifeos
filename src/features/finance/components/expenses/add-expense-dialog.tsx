"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
    Button,
    DatePicker,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Select,
} from "@/components/ui";

import {
    ExpenseFormInput,
    expenseSchema,
    type ExpenseFormValues,
} from "../../schemas/expense-schema";
import { Expense } from "../../types/expense";
import { parseDateValue } from "@/lib/utils/date";
import { useEffect } from "react";

interface AddExpenseDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: ExpenseFormValues) => boolean;
    expense?: Expense | null;
    accounts: { label: string; value: string }[];
    error?: string;
}

const categoryOptions = [
    { label: "Food", value: "Food" },
    { label: "Shopping", value: "Shopping" },
    { label: "Transport", value: "Transport" },
    { label: "Bills", value: "Bills" },
    { label: "Health", value: "Health" },
    { label: "Entertainment", value: "Entertainment" },
    { label: "Other", value: "Other" },
];

const defaultValues: ExpenseFormInput = {
    amount: undefined,
    merchant: "",
    category: "Shopping",
    account: "",
    date: new Date(),
    note: "",
}

export function AddExpenseDialog({
    open,
    onOpenChange,
    onSubmit,
    expense,
    accounts,
    error,
}: AddExpenseDialogProps) {
    const {
        register,
        handleSubmit,
        reset,
        control,
        formState: { errors, isSubmitting },
    } = useForm<
        ExpenseFormInput,
        undefined,
        ExpenseFormValues
    >({
        resolver: zodResolver(expenseSchema),
        defaultValues,
    });

    const handleFormSubmit = (data: ExpenseFormValues) => {
        if (onSubmit(data)) onOpenChange(false);
    };

    const handleCancel = () => {
        reset();
        onOpenChange(false);
    };

    useEffect(() => {
        if (!open) return;

        if (expense) {
            reset({
                amount: expense.amount,
                merchant: expense.merchant,
                category: expense.category,
                account: expense.account,
                date: parseDateValue(expense.date),
                note: expense.note ?? "",
            });
        } else {
            reset(defaultValues);
        }
    }, [open, expense, reset]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-130">
                <DialogHeader>
                    <DialogTitle>
                        {expense ? "Edit expense" : "Add expense"}
                    </DialogTitle>

                    <DialogDescription>
                        {expense
                            ? "Update the details of this expense."
                            : "Record an expense and keep your financial picture up to date."}
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
                                maxLength={10}
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
                        <Controller
                            name="category"
                            control={control}
                            render={({ field, fieldState }) => (
                                <Select
                                    id="category"
                                    label="Category"
                                    options={categoryOptions}
                                    value={field.value}
                                    onChange={(value) => field.onChange(value ?? "")}
                                    placeholder="Select category"
                                    required
                                    error={fieldState.error?.message}
                                />
                            )}
                        />

                        <Controller
                            name="account"
                            control={control}
                            render={({ field, fieldState }) => (
                                <Select
                                    id="account"
                                    label="Account"
                                    options={accounts}
                                    value={field.value}
                                    onChange={(value) => field.onChange(value ?? "")}
                                    placeholder="Select account"
                                    required
                                    error={fieldState.error?.message}
                                />
                            )}
                        />
                    </div>

                    {/* Date */}
                    <Controller
                        name="date"
                        control={control}
                        render={({ field, fieldState }) => (
                            <DatePicker
                                id="date"
                                label="Date"
                                value={field.value}
                                onChange={field.onChange}
                                required
                                error={fieldState.error?.message}
                            />
                        )}
                    />

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

                    {error && <p role="alert" className="text-xs text-danger">{error}</p>}

                    <DialogFooter className="mt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleCancel}
                        >
                            Cancel
                        </Button>

                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting
                                ? "Saving..."
                                : expense
                                    ? "Save changes"
                                    : "Add expense"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
