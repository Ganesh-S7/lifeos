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
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExpenseCategoryCombobox } from "./expense-category-combobox";
import { pendingExpenseAccount } from "../../utils/expense-account";
import { useFinanceMutation } from "../../hooks/use-finance-mutation";
import type { FinanceMutationCallback } from "../../utils/finance-mutation";

interface AddExpenseDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: FinanceMutationCallback<ExpenseFormValues>;
    expense?: Expense | null;
    accounts: { label: string; value: string }[];
    error?: string;
    accountsLoading?: boolean;
}

const defaultValues: ExpenseFormInput = {
    amount: undefined,
    merchant: "",
    category: "",
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
    accountsLoading = false,
}: AddExpenseDialogProps) {
    const mutation = useFinanceMutation();
    const categoryBusy = useRef(false);
    const [categorySaving, setCategorySaving] = useState(false);
    const [submissionError, setSubmissionError] = useState("");
    const {
        register,
        handleSubmit,
        reset,
        control,
        getValues,
        getFieldState,
        setValue,
        formState: { errors, isSubmitting },
    } = useForm<
        ExpenseFormInput,
        undefined,
        ExpenseFormValues
    >({
        resolver: zodResolver(expenseSchema),
        defaultValues,
    });

    const handleFormSubmit = async (data: ExpenseFormValues) => {
        setSubmissionError("");
        if (categoryBusy.current || accountsLoading || !accounts.some((account) => account.value === data.account)) {
            setSubmissionError("Select an available bank account before saving this expense.");
            return;
        }
        return mutation.run(() => onSubmit(data), {
            onSuccess: () => onOpenChange(false),
            onError: (cause) => setSubmissionError(
                cause instanceof Error ? cause.message : "Could not save expense. Please try again.",
            ),
        });
    };

    const handleCancel = () => {
        if (mutation.isPending() || isSubmitting || categoryBusy.current) return;
        setSubmissionError("");
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
            reset({ ...defaultValues, date: new Date() });
        }
    }, [open, expense, reset]);

    useEffect(() => {
        if (!open || expense || accountsLoading) return;
        const current = getValues("account");
        const next = pendingExpenseAccount(current, getFieldState("account").isDirty, accounts);
        if (next !== current) setValue("account", next, { shouldDirty: false });
    }, [open, expense, accounts, accountsLoading, getValues, getFieldState, setValue]);

    function handleCategoryBusy(busy: boolean) {
        categoryBusy.current = busy;
        setCategorySaving(busy);
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (mutation.isPending() || isSubmitting || categoryBusy.current) return;
                setSubmissionError("");
                onOpenChange(nextOpen);
            }}
        >
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
                    onSubmit={(event) => handleSubmit(handleFormSubmit)(event)}
                    className="mt-6 space-y-5"
                >
                    <fieldset disabled={isSubmitting || mutation.isPendingState || categorySaving} className="space-y-5">
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
                                    inputMode="decimal"
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
                                Merchant / Store
                            </label>

                            <Input
                                id="merchant"
                                placeholder="e.g. Nandini Milk Booth, Swiggy, local food stall"
                                aria-describedby="merchant-help"
                                {...register("merchant")}
                            />

                            <p id="merchant-help" className="text-xs text-text-secondary">
                                Where you spent the money, not what you purchased.
                            </p>

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
                                    <ExpenseCategoryCombobox
                                        value={field.value}
                                        onChange={field.onChange}
                                        onBusyChange={handleCategoryBusy}
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
                                        placeholder={accountsLoading ? "Loading accounts..." : "Select account"}
                                        disabled={accountsLoading || accounts.length === 0}
                                        required
                                        error={fieldState.error?.message}
                                    />
                                )}
                            />
                        </div>

                        {accountsLoading && <p role="status" className="text-xs text-text-secondary">Loading bank accounts...</p>}
                        {!accountsLoading && accounts.length === 0 && (
                            <p className="text-xs text-text-secondary">
                                Add a bank account before recording an expense.{" "}
                                <Link href="/finance" className="font-medium text-primary underline">Manage Finances</Link>
                            </p>
                        )}

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
                                placeholder="e.g. milk, dosa and coffee"
                                {...register("note")}
                                className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text-primary outline-none transition placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/15 sm:text-sm"
                            />

                            {errors.note && (
                                <p className="text-xs text-danger">
                                    {errors.note.message}
                                </p>
                            )}
                        </div>

                        {(submissionError || error) && (
                            <p role="alert" className="text-xs text-danger">{submissionError || error}</p>
                        )}

                        <DialogFooter className="mt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleCancel}
                                disabled={isSubmitting || mutation.isPendingState || categorySaving}
                            >
                                Cancel
                            </Button>

                            <Button type="submit" disabled={isSubmitting || mutation.isPendingState || categorySaving || accountsLoading || accounts.length === 0}>
                                {isSubmitting || mutation.isPendingState || categorySaving
                                    ? "Saving..."
                                    : expense
                                        ? "Save changes"
                                        : "Add expense"}
                            </Button>
                        </DialogFooter>
                    </fieldset>
                </form>
            </DialogContent>
        </Dialog>
    );
}
