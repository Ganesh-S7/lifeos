"use client";

import { Controller, useForm } from "react-hook-form";
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
    Select,
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

const categoryOptions = [
    { label: "Food", value: "Food" },
    { label: "Shopping", value: "Shopping" },
    { label: "Transport", value: "Transport" },
    { label: "Bills", value: "Bills" },
    { label: "Health", value: "Health" },
    { label: "Entertainment", value: "Entertainment" },
    { label: "Other", value: "Other" },
];

const accountOptions = [
    { label: "Primary Account", value: "Primary Account" },
    { label: "Wallet", value: "Wallet" },
    { label: "Savings", value: "Savings" },
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
        control,
        formState: { errors, isSubmitting },
    } = useForm<ExpenseFormValues>({
        resolver: zodResolver(expenseSchema),
        defaultValues: {
            amount: undefined,
            merchant: "",
            category: "Shopping",
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
                                    options={accountOptions}
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