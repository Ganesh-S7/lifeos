"use client";

import { useEffect, useSyncExternalStore } from "react";
import { mockExpenses } from "../data/mock-expenses";
import type {
    BankAccount, FinanceData, FinanceTransaction, Investment, Liability,
} from "../types/finance";
import {
    accountBalance,
    financialSnapshot,
    investmentValue,
} from "../utils/finance-calculations";

const storageKey = "lifeos-finance-v1";
const demoTransactions: FinanceTransaction[] = mockExpenses.map((expense) => ({
    id: expense.id,
    type: "expense",
    amount: expense.amount,
    description: expense.merchant,
    date: expense.date,
    recordedAt: `${expense.date}T12:00:00.000Z`,
    category: expense.category,
    demoAccount: expense.account,
    note: expense.note,
}));
const initialData: FinanceData = {
    accounts: [],
    investments: [],
    liabilities: [],
    transactions: demoTransactions,
    positionHistory: [],
};

let data: FinanceData = initialData;
let hydrated = false;
let loadError = "";
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

function hydrate() {
    if (hydrated || typeof window === "undefined") return;
    try {
        let nextData = data;
        const saved = window.localStorage.getItem(storageKey);
        if (saved) {
            const parsed: FinanceData = JSON.parse(saved);
            if (!Array.isArray(parsed.accounts) || !Array.isArray(parsed.transactions) ||
                !Array.isArray(parsed.investments) || !Array.isArray(parsed.liabilities)) {
                throw new Error("Invalid saved finance data.");
            }
            nextData = parsed;
        }
        if (!Array.isArray(nextData.positionHistory) || nextData.positionHistory.length === 0) {
            const { bank, investments, debt } = financialSnapshot(nextData);
            nextData = {
                ...nextData,
                positionHistory: [{
                    recordedAt: new Date().toISOString(),
                    bank,
                    investments,
                    debt,
                }],
            };
            window.localStorage.setItem(storageKey, JSON.stringify(nextData));
        }
        data = nextData;
        hydrated = true;
        loadError = "";
    } catch {
        // Preserve the saved value and offer retry instead of overwriting it.
        loadError = "Unable to load saved finance data. Check browser storage access and try again.";
    }
    notify();
}

function requireReady() {
    hydrate();
    if (!hydrated) throw new Error(loadError || "Finance data is not ready. Please try again.");
}

function commit(next: FinanceData) {
    const { bank, investments, debt } = financialSnapshot(next);
    data = {
        ...next,
        positionHistory: [
            ...(data.positionHistory ?? []),
            { recordedAt: new Date().toISOString(), bank, investments, debt },
        ],
    };
    try {
        window.localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
        // The in-memory session remains usable when storage is unavailable.
    }
    notify();
}

export function useFinance() {
    const snapshot = useSyncExternalStore(subscribe, () => data, () => initialData);
    const ready = useSyncExternalStore(subscribe, () => hydrated, () => false);
    const error = useSyncExternalStore(subscribe, () => loadError, () => "");
    useEffect(hydrate, []);
    return { data: snapshot, ready, loadError: error, retry: hydrate };
}

function requireAmount(value: number, allowZero = false) {
    if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
        throw new Error(allowZero ? "Enter a valid non-negative amount." : "Amount must be greater than zero.");
    }
}

function validateBalances(next: FinanceData) {
    const ordered = [...next.transactions].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    for (const account of next.accounts) {
        let balance = account.balanceSnapshot;
        for (const transaction of ordered) {
            if (transaction.recordedAt <= account.balanceSnapshotAt) continue;
            balance = accountBalance({
                ...account, balanceSnapshot: balance,
                balanceSnapshotAt: ""
            }, [transaction]);
            if (balance < -0.001) throw new Error(`${account.name} would have a negative balance.`);
        }
    }
    for (const investment of next.investments) {
        let value = investment.valuationSnapshot;
        for (const transaction of ordered) {
            if (transaction.recordedAt <= investment.valuationSnapshotAt) continue;
            value = investmentValue({ ...investment, valuationSnapshot: value, valuationSnapshotAt: "" }, [transaction]);
            if (value < -0.001) {
                throw new Error(`${investment.name} does not have enough tracked value for this sale.`);
            }
        }
    }
}

export const financeActions = {
    saveAccount(input: { id?: string; name: string; balance: number; }) {
        requireReady();
        requireAmount(input.balance, true);
        if (!input.name.trim()) throw new Error("Enter an account name.");
        const now = new Date().toISOString();
        const existing = data.accounts.find((account) => account.id === input.id);
        const account: BankAccount = {
            id: existing?.id ?? crypto.randomUUID(),
            name: input.name.trim(),
            balanceSnapshot: input.balance,
            balanceSnapshotAt: now,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        commit({
            ...data, accounts: existing
                ? data.accounts.map((item) => item.id === existing.id ? account : item)
                : [...data.accounts, account]
        });
    },
    deleteAccount(id: string) {
        requireReady();
        if (data.transactions.some((transaction) => transaction.accountId === id ||
            transaction.destinationAccountId === id)) {
            throw new Error("This account has transactions. Delete or move those transactions first.");
        }
        commit({ ...data, accounts: data.accounts.filter((account) => account.id !== id) });
    },
    saveInvestment(input: { id?: string; name: string; type: string; value: number; }) {
        requireReady();
        requireAmount(input.value, true);
        if (!input.name.trim() || !input.type.trim()) throw new Error("Enter a name and investment type.");
        const now = new Date().toISOString();
        const existing = data.investments.find((investment) => investment.id === input.id);
        const investment: Investment = {
            id: existing?.id ?? crypto.randomUUID(),
            name: input.name.trim(),
            type: input.type.trim(),
            valuationSnapshot: input.value,
            valuationSnapshotAt: now,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        commit({
            ...data, investments: existing
                ? data.investments.map((item) => item.id === existing.id ? investment : item)
                : [...data.investments, investment]
        });
    },
    deleteInvestment(id: string) {
        requireReady();
        if (data.transactions.some((transaction) => transaction.investmentId === id)) {
            throw new Error("This investment has transactions. Delete those transactions first.");
        }
        commit({ ...data, investments: data.investments.filter((item) => item.id !== id) });
    },
    saveLiability(input: { id?: string; name: string; type: string; balance: number; monthlyPayment?: number; }) {
        requireReady();
        requireAmount(input.balance, true);
        if (input.monthlyPayment !== undefined) requireAmount(input.monthlyPayment, true);
        if (!input.name.trim() || !input.type.trim()) throw new Error("Enter a name and liability type.");
        const now = new Date().toISOString();
        const existing = data.liabilities.find((liability) => liability.id === input.id);
        const liability: Liability = {
            ...input,
            id: existing?.id ?? crypto.randomUUID(),
            name: input.name.trim(),
            type: input.type.trim(),
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        commit({
            ...data, liabilities: existing
                ? data.liabilities.map((item) => item.id === existing.id ? liability : item)
                : [...data.liabilities, liability]
        });
    },
    deleteLiability(id: string) {
        requireReady();
        commit({ ...data, liabilities: data.liabilities.filter((item) => item.id !== id) });
    },
    saveTransaction(input: Omit<FinanceTransaction, "id" | "recordedAt"> & { id?: string; }) {
        requireReady();
        requireAmount(input.amount);
        if (!input.description.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
            throw new Error("Enter a description and valid date.");
        }
        if (input.type === "expense" && !input.category) throw new Error("Select a category.");
        if (!input.demoAccount && !data.accounts.some((account) => account.id === input.accountId)) {
            throw new Error("Select a registered account.");
        }
        if (input.type === "transfer" && (!input.destinationAccountId ||
            input.destinationAccountId === input.accountId ||
            !data.accounts.some((account) => account.id === input.destinationAccountId))) {
            throw new Error("Choose a different destination account.");
        }
        if ((input.type === "investment_purchase" || input.type === "investment_sale") &&
            !data.investments.some((investment) => investment.id === input.investmentId)) {
            throw new Error("Select an investment.");
        }
        const existing = data.transactions.find((transaction) => transaction.id === input.id);
        const transaction: FinanceTransaction = {
            ...input,
            id: existing?.id ?? crypto.randomUUID(),
            description: input.description.trim(),
            recordedAt: existing?.recordedAt ?? new Date().toISOString(),
        };
        const next = {
            ...data, transactions: existing
                ? data.transactions.map((item) => item.id === existing.id ? transaction : item)
                : [...data.transactions, transaction]
        };
        validateBalances(next);
        commit(next);
    },
    deleteTransaction(id: string) {
        requireReady();
        const next = { ...data, transactions: data.transactions.filter((item) => item.id !== id) };
        validateBalances(next);
        commit(next);
    },
};
