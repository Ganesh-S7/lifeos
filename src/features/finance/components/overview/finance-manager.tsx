"use client";

import { useState } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Select } from "@/components/ui";
import { formatDateValue } from "@/lib/utils/date";
import { financeActions, useFinance } from "../../store/finance-store";
import type { FinanceTransaction } from "../../types/finance";
import { accountBalance, investmentValue } from "../../utils/finance-calculations";

export type ManagerKind = "account" | "investment" | "liability" | "transaction";

interface Props {
    kind: ManagerKind | null;
    onClose: () => void;
    editId?: string;
}

const transactionTypes = [
    { label: "Income", value: "income" },
    { label: "Transfer", value: "transfer" },
    { label: "Investment purchase", value: "investment_purchase" },
    { label: "Investment sale", value: "investment_sale" },
];

export function FinanceManager({ kind, onClose, editId }: Props) {
    const { data } = useFinance();
    const item = kind === "account" ? data.accounts.find((entry) => entry.id === editId)
        : kind === "investment" ? data.investments.find((entry) => entry.id === editId)
            : kind === "liability" ? data.liabilities.find((entry) => entry.id === editId)
                : data.transactions.find((entry) => entry.id === editId);
    const [name, setName] = useState(item ? ("name" in item ? item.name : item.description) : "");
    const [type, setType] = useState(item && "type" in item ? item.type : kind === "transaction" ? "income" : "");
    const [amount, setAmount] = useState(item ? String("amount" in item ? item.amount : "balanceSnapshot" in item
        ? accountBalance(item, data.transactions)
        : "valuationSnapshot" in item ? investmentValue(item, data.transactions) : item.balance) : "");
    const [payment, setPayment] = useState(item && "monthlyPayment" in item && item.monthlyPayment !== undefined
        ? String(item.monthlyPayment) : "");
    const [date, setDate] = useState(item && "date" in item ? item.date : formatDateValue(new Date()));
    const [accountId, setAccountId] = useState(item && "accountId" in item ? item.accountId || "" : data.accounts[0]?.id || "");
    const [destinationId, setDestinationId] = useState(item && "destinationAccountId" in item ? item.destinationAccountId || "" : "");
    const [investmentId, setInvestmentId] = useState(item && "investmentId" in item ? item.investmentId || "" : "");
    const [error, setError] = useState("");

    function save(event: React.FormEvent) {
        event.preventDefault();
        try {
            const value = Number(amount);
            if (amount.trim() === "") throw new Error("Enter an amount.");
            if (kind === "account") financeActions.saveAccount({ id: editId, name, balance: value });
            if (kind === "investment") financeActions.saveInvestment({ id: editId, name, type, value });
            if (kind === "liability") financeActions.saveLiability({
                id: editId, name, type, balance: value,
                monthlyPayment: payment ? Number(payment) : undefined,
            });
            if (kind === "transaction") financeActions.saveTransaction({
                id: editId,
                type: type as FinanceTransaction["type"],
                description: name,
                amount: value,
                date,
                accountId,
                destinationAccountId: type === "transfer" ? destinationId : undefined,
                investmentId: type.startsWith("investment") ? investmentId : undefined,
            });
            onClose();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not save.");
        }
    }

    const accountOptions = data.accounts.map((account) => ({ label: account.name, value: account.id }));
    const investmentOptions = data.investments.map((investment) => ({ label: investment.name, value: investment.id }));
    const title = kind === "account" ? "bank account" : kind === "investment" ? "investment"
        : kind === "liability" ? "liability" : "transaction";

    return (
        <Dialog open={kind !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{editId ? "Edit" : "Add"} {title}</DialogTitle>
                    <DialogDescription>
                        {kind === "account" ? "Enter the balance accurate right now. Earlier transactions will not be applied again."
                            : kind === "investment" ? "Maintain a manual valuation. This is not a live market quote."
                                : kind === "liability" ? "Maintain the outstanding balance manually. EMI does not automatically reduce principal."
                                    : "Record a transaction against your accounts."}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={save} className="mt-5 space-y-4">
                    {kind === "transaction" && (
                        <Select
                            label="Type"
                            options={transactionTypes}
                            value={type}
                            onChange={(value) => setType(value || "")}
                            required
                        />
                    )}
                    <label className="block space-y-1.5 text-xs font-medium text-text-primary">
                        <span>{kind === "transaction" ? "Description" : "Name"}</span>
                        <Input value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} />
                    </label>
                    {(kind === "investment" || kind === "liability") && (
                        <label className="block space-y-1.5 text-xs font-medium text-text-primary">
                            <span>Type</span>
                            <Input value={type} onChange={(event) => setType(event.target.value)}
                                placeholder={kind === "investment" ? "e.g. Cryptocurrency" : "e.g. Bike loan"} required />
                        </label>
                    )}
                    <label className="block space-y-1.5 text-xs font-medium text-text-primary">
                        <span>{kind === "account" ? "Current balance" : kind === "investment" ? "Current valuation"
                            : kind === "liability" ? "Outstanding balance" : "Amount"}</span>
                        <Input type="number" min="0" step="0.01" value={amount}
                            onChange={(event) => setAmount(event.target.value)} required />
                    </label>
                    {kind === "liability" && (
                        <label className="block space-y-1.5 text-xs font-medium text-text-primary">
                            <span>Monthly payment (optional)</span>
                            <Input type="number" min="0" step="0.01" value={payment}
                                onChange={(event) => setPayment(event.target.value)} />
                        </label>
                    )}
                    {kind === "transaction" && (
                        <>
                            <Select label="Account" options={accountOptions} value={accountId}
                                onChange={(value) => setAccountId(value || "")} required />
                            {type === "transfer" && (
                                <Select label="Destination account" options={accountOptions} value={destinationId}
                                    onChange={(value) => setDestinationId(value || "")} required />
                            )}
                            {type.startsWith("investment") && (
                                <Select label="Investment" options={investmentOptions} value={investmentId}
                                    onChange={(value) => setInvestmentId(value || "")} required />
                            )}
                            <label className="block space-y-1.5 text-xs font-medium text-text-primary">
                                <span>Transaction date</span>
                                <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
                            </label>
                        </>
                    )}
                    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                        <Button type="submit">Save {title}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
