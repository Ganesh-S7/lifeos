"use client";

import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFinanceMutation } from "../../hooks/use-finance-mutation";
import { notify } from "@/lib/notifications";

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
    formatDateValue,
    parseDateValue,
} from "@/lib/utils/date";

import {
    financeActions,
    useFinance,
} from "../../store/finance-store";

import type { FinanceTransaction } from "../../types/finance";

import {
    accountBalance,
    investmentValue,
} from "../../utils/finance-calculations";
import { createFinanceManagerSchema, FinanceManagerFormInput, FinanceManagerFormValues } from "../../store/finance-manager-schema";


export type ManagerKind =
    | "account"
    | "investment"
    | "liability"
    | "transaction";

interface Props {
    kind: ManagerKind | null;
    onClose: () => void;
    editId?: string;
}

const transactionTypes = [
    { label: "Income", value: "income" },
    { label: "Transfer", value: "transfer" },
    {
        label: "Investment purchase",
        value: "investment_purchase",
    },
    {
        label: "Investment sale",
        value: "investment_sale",
    },
];

export function FinanceManager({
    kind,
    onClose,
    editId,
}: Props) {
    const { data } = useFinance();

    const [error, setError] = useState("");
    const mutation = useFinanceMutation();

    const item =
        kind === "account"
            ? data.accounts.find((entry) => entry.id === editId)
            : kind === "investment"
                ? data.investments.find((entry) => entry.id === editId)
                : kind === "liability"
                    ? data.liabilities.find((entry) => entry.id === editId)
                    : data.transactions.find((entry) => entry.id === editId);

    const initialName = item
        ? "name" in item
            ? item.name
            : item.description
        : "";

    const initialType =
        item && "type" in item
            ? item.type
            : kind === "transaction"
                ? "income"
                : "";

    const initialAmount = item
        ? String(
            "amount" in item
                ? item.amount
                : "balanceSnapshot" in item
                    ? accountBalance(item, data.transactions)
                    : "valuationSnapshot" in item
                        ? investmentValue(item, data.transactions)
                        : item.balance,
        )
        : "";

    const initialPayment =
        item &&
            "monthlyPayment" in item &&
            item.monthlyPayment !== undefined
            ? String(item.monthlyPayment)
            : "";

    const initialDate =
        item && "date" in item
            ? item.date
            : formatDateValue(new Date());

    const initialAccountId =
        item && "accountId" in item
            ? item.accountId || ""
            : data.accounts[0]?.id || "";

    const initialDestinationId =
        item && "destinationAccountId" in item
            ? item.destinationAccountId || ""
            : "";

    const initialInvestmentId =
        item && "investmentId" in item
            ? item.investmentId || ""
            : "";

    const schema = useMemo(
        () => createFinanceManagerSchema(kind ?? "account"),
        [kind],
    );

    const {
        register,
        control,
        handleSubmit,
        setValue,
        formState: { errors, isSubmitting },
    } = useForm<
        FinanceManagerFormInput,
        undefined,
        FinanceManagerFormValues
    >({
        resolver: zodResolver(schema),
        defaultValues: {
            name: initialName,
            type: initialType,
            amount: initialAmount,
            payment: initialPayment,
            date: initialDate,
            accountId: initialAccountId,
            destinationId: initialDestinationId,
            investmentId: initialInvestmentId,
        },
    });

    const selectedType = useWatch({
        control,
        name: "type",
        defaultValue: initialType,
    });
    const selectedDestinationId = useWatch({
        control,
        name: "destinationId",
        defaultValue: initialType,
    });
    const selectedInvestmentId = useWatch({
        control,
        name: "investmentId",
        defaultValue: initialType,
    });

    const accountOptions = data.accounts.map((account) => ({
        label: account.name,
        value: account.id,
    }));

    const investmentOptions = data.investments.map(
        (investment) => ({
            label: investment.name,
            value: investment.id,
        }),
    );

    const title =
        kind === "account"
            ? "bank account"
            : kind === "investment"
                ? "investment"
                : kind === "liability"
                    ? "liability"
                    : "transaction";

    function clearFormError() {
        setError("");
    }

    function handleTransactionTypeChange(value: string) {
        setValue("type", value, {
            shouldValidate: true,
            shouldDirty: true,
        });

        // Clear errors belonging to fields that may be hidden
        // after changing the transaction type.
        setValue(
            "destinationId",
            value === "transfer"
                ? selectedDestinationId
                : "",
        );

        setValue(
            "investmentId",
            value.startsWith("investment")
                ? selectedInvestmentId
                : "",
        );

        clearFormError();
    }

    async function save(values: FinanceManagerFormValues) {
        if (!kind) {
            return;
        }

        setError("");

        return mutation.run(async () => {
            if (kind === "account") {
                await financeActions.saveAccount({
                    id: editId,
                    name: values.name,
                    balance: values.amount,
                });
            }

            if (kind === "investment") {
                await financeActions.saveInvestment({
                    id: editId,
                    name: values.name,
                    type: values.type,
                    value: values.amount,
                });
            }

            if (kind === "liability") {
                await financeActions.saveLiability({
                    id: editId,
                    name: values.name,
                    type: values.type,
                    balance: values.amount,
                    monthlyPayment: values.payment,
                });
            }

            if (kind === "transaction") {
                await financeActions.saveTransaction({
                    id: editId,
                    type: values.type as FinanceTransaction["type"],
                    description: values.name,
                    amount: values.amount,
                    date: values.date,
                    accountId: values.accountId,
                    destinationAccountId:
                        values.type === "transfer"
                            ? values.destinationId
                            : undefined,
                    investmentId: values.type.startsWith("investment")
                        ? values.investmentId
                        : undefined,
                });
            }

            return true;
        }, {
            onSuccess: () => {
                const label = kind === "account" ? "Bank account"
                    : kind === "investment" ? "Investment"
                        : kind === "liability" ? "Liability" : "Transaction";
                notify.success(`${label} ${editId ? "updated" : "saved"}.`);
                onClose();
            },
            onError: (cause) => {
                notify.error(`Unable to save this ${title}.`, {
                    description: "Review the form and try again. Your changes have not been saved.",
                });
                setError(
                    cause instanceof Error
                        ? cause.message
                        : "Could not save. Please try again.",
                );
            },
        });
    }

    return (
        <Dialog
            open={kind !== null}
            onOpenChange={(open) => {
                if (!open && !mutation.isPending() && !isSubmitting) onClose();
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {editId ? "Edit" : "Add"} {title}
                    </DialogTitle>

                    <DialogDescription>
                        {kind === "account"
                            ? "Enter the balance accurate right now. Earlier transactions will not be applied again."
                            : kind === "investment"
                                ? "Maintain a manual valuation. This is not a live market quote."
                                : kind === "liability"
                                    ? "Maintain the outstanding balance manually. EMI does not automatically reduce principal."
                                    : "Record a transaction against your accounts."}
                    </DialogDescription>
                </DialogHeader>

                <form
                    onSubmit={handleSubmit(save)}
                    noValidate
                    className="mt-5 space-y-4"
                >
                    <fieldset disabled={isSubmitting || mutation.isPendingState} className="space-y-4">
                        {kind === "transaction" && (
                            <Controller
                                name="type"
                                control={control}
                                render={({ field, fieldState }) => (
                                    <Select
                                        label="Type"
                                        options={transactionTypes}
                                        value={field.value}
                                        onChange={(value) => {
                                            handleTransactionTypeChange(
                                                value ? String(value) : "",
                                            );
                                        }}
                                        error={fieldState.error?.message}
                                        required
                                    />
                                )}
                            />
                        )}

                        <Input
                            label={
                                kind === "transaction"
                                    ? "Description"
                                    : "Name"
                            }
                            placeholder={
                                kind === "transaction"
                                    ? "Enter transaction description"
                                    : "Enter name"
                            }
                            maxLength={100}
                            required
                            {...register("name", {
                                onChange: clearFormError,
                            })}
                            error={errors.name?.message}
                        />

                        {(kind === "investment" ||
                            kind === "liability") && (
                                <Input
                                    label="Type"
                                    placeholder={
                                        kind === "investment"
                                            ? "e.g. Cryptocurrency"
                                            : "e.g. Bike loan"
                                    }
                                    required
                                    {...register("type", {
                                        onChange: clearFormError,
                                    })}
                                    maxLength={100}
                                    error={errors.type?.message}
                                />
                            )}

                        <Input
                            label={
                                kind === "account"
                                    ? "Current balance"
                                    : kind === "investment"
                                        ? "Current valuation"
                                        : kind === "liability"
                                            ? "Outstanding balance"
                                            : "Amount"
                            }
                            placeholder="Enter amount"
                            inputMode="decimal"
                            required
                            maxLength={12}
                            {...register("amount", {
                                onChange: clearFormError,
                            })}
                            error={errors.amount?.message}
                        />

                        {kind === "liability" && (
                            <Input
                                label="Monthly payment"
                                placeholder="Enter monthly payment"
                                inputMode="decimal"
                                {...register("payment", {
                                    onChange: clearFormError,
                                })}
                                maxLength={12}
                                error={errors.payment?.message}
                            />
                        )}

                        {kind === "transaction" && (
                            <>
                                <Controller
                                    name="accountId"
                                    control={control}
                                    render={({ field, fieldState }) => (
                                        <Select
                                            label="Account"
                                            options={accountOptions}
                                            value={field.value}
                                            onChange={(value) => {
                                                field.onChange(
                                                    value ? String(value) : "",
                                                );
                                                clearFormError();
                                            }}
                                            error={fieldState.error?.message}
                                            required
                                        />
                                    )}
                                />

                                {selectedType === "transfer" && (
                                    <Controller
                                        name="destinationId"
                                        control={control}
                                        render={({ field, fieldState }) => (
                                            <Select
                                                label="Destination account"
                                                options={accountOptions}
                                                value={field.value}
                                                onChange={(value) => {
                                                    field.onChange(
                                                        value ? String(value) : "",
                                                    );
                                                    clearFormError();
                                                }}
                                                error={fieldState.error?.message}
                                                required
                                            />
                                        )}
                                    />
                                )}

                                {selectedType.startsWith("investment") && (
                                    <Controller
                                        name="investmentId"
                                        control={control}
                                        render={({ field, fieldState }) => (
                                            <Select
                                                label="Investment"
                                                options={investmentOptions}
                                                value={field.value}
                                                onChange={(value) => {
                                                    field.onChange(
                                                        value ? String(value) : "",
                                                    );
                                                    clearFormError();
                                                }}
                                                error={fieldState.error?.message}
                                                required
                                            />
                                        )}
                                    />
                                )}

                                <Controller
                                    name="date"
                                    control={control}
                                    render={({ field, fieldState }) => (
                                        <DatePicker
                                            id="transaction-date"
                                            label="Transaction date"
                                            value={
                                                field.value
                                                    ? parseDateValue(field.value)
                                                    : null
                                            }
                                            onChange={(selectedDate) => {
                                                field.onChange(
                                                    selectedDate
                                                        ? formatDateValue(selectedDate)
                                                        : "",
                                                );
                                                clearFormError();
                                            }}
                                            placeholder="Select transaction date"
                                            error={fieldState.error?.message}
                                            required
                                        />
                                    )}
                                />
                            </>
                        )}

                        {error && (
                            <p
                                role="alert"
                                className="rounded-lg bg-danger-subtle p-3 text-sm text-danger"
                            >
                                {error}
                            </p>
                        )}

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onClose}
                                disabled={isSubmitting || mutation.isPendingState}
                            >
                                Cancel
                            </Button>

                            <Button
                                type="submit"
                                disabled={isSubmitting || mutation.isPendingState}
                            >
                                {isSubmitting || mutation.isPendingState ? "Saving..." : `Save ${title}`}
                            </Button>
                        </DialogFooter>
                    </fieldset>
                </form>
            </DialogContent>
        </Dialog>
    );
}
