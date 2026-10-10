"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, DeleteModal } from "@/components/ui";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateDisplay, formatDateValue } from "@/lib/utils/date";
import { financeActions, useFinance } from "../../store/finance-store";
import { accountBalance, categorySpending, financialSnapshot, investmentValue, monthlyActivity } from "../../utils/finance-calculations";
import { CategoryBreakdownChart } from "./category-breakdown-chart";
import { FinanceCharts } from "./finance-charts";
import { FinanceManager, type ManagerKind } from "./finance-manager";

export function FinanceOverview() {
    const { data, ready } = useFinance();
    const [manager, setManager] = useState<ManagerKind | null>(null);
    const [editId, setEditId] = useState<string>();
    const [target, setTarget] = useState<{ kind: ManagerKind; id: string; name: string } | null>(null);
    const [error, setError] = useState("");
    const month = formatDateValue(new Date()).slice(0, 7);
    const snapshot = financialSnapshot(data);
    const hasSnapshot = data.accounts.length + data.investments.length + data.liabilities.length > 0;
    const activity = monthlyActivity(data.transactions, month);
    const categories = categorySpending(data.transactions, month);
    const recent = [...data.transactions].sort((a, b) =>
        b.date.localeCompare(a.date) || b.recordedAt.localeCompare(a.recordedAt)).slice(0, 5);
    const chartData = Array.from({ length: 6 }, (_, index) => {
        const date = new Date(new Date().getFullYear(), new Date().getMonth() - 5 + index, 1);
        const key = formatDateValue(date).slice(0, 7);
        const hasRecords = data.transactions.some((item) => item.date.startsWith(key));
        const values = monthlyActivity(data.transactions, key);
        const sample = index < 5 && !hasRecords;
        return {
            month: date.toLocaleDateString("en-IN", { month: "short" }),
            income: sample ? [32000, 37000, 34000, 39000, 36000][index] : values.income,
            expenses: sample ? [22000, 26000, 24000, 28000, 25000][index] : values.expenses,
            netWorth: index === 5 ? snapshot.netWorth : hasSnapshot
                ? snapshot.netWorth - (5 - index) * 2500 : 0,
        };
    });

    function open(kind: ManagerKind, id?: string) {
        setEditId(id);
        setManager(kind);
        setError("");
    }

    function remove() {
        if (!target) return;
        try {
            if (target.kind === "account") financeActions.deleteAccount(target.id);
            if (target.kind === "investment") financeActions.deleteInvestment(target.id);
            if (target.kind === "liability") financeActions.deleteLiability(target.id);
            if (target.kind === "transaction") financeActions.deleteTransaction(target.id);
            setError("");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not delete item.");
        }
        setTarget(null);
    }

    const groups = [
        { kind: "account" as const, label: "Bank balance", value: snapshot.bank, items: data.accounts },
        { kind: "investment" as const, label: "Investments", value: snapshot.investments, items: data.investments },
        { kind: "liability" as const, label: "Outstanding debt", value: snapshot.debt, items: data.liabilities },
    ];

    return (
        <div className="space-y-7">
            <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Finance overview</h1>
                    <p className="mt-1 text-sm text-text-secondary">Your financial position and this month&apos;s activity.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" disabled={data.accounts.length === 0} onClick={() => open("transaction")}>Record income or transfer</Button>
                    <Link href="/finance/expenses" className="rounded-lg border border-border bg-surface px-3.5 py-2 text-sm text-text-primary">Manage expenses</Link>
                </div>
            </header>
            {!ready && <p className="text-sm text-text-secondary">Loading finance data…</p>}
            {error && <p role="alert" className="rounded-lg bg-danger-subtle p-3 text-sm text-danger">{error}</p>}
            <section className="space-y-3" aria-labelledby="snapshot-title">
                <div>
                    <h2 id="snapshot-title" className="text-base font-semibold text-text-primary">Overall financial snapshot</h2>
                    <p className="text-xs text-text-secondary">Current balances, valuations and debt</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {groups.map((group) => (
                        <article key={group.kind} className="rounded-2xl border border-border bg-surface p-5">
                            <p className="text-sm text-text-secondary">{group.label}</p>
                            <p className="mt-4 text-2xl font-semibold text-text-primary">{formatCurrency(group.value)}</p>
                            <div className="mt-4 space-y-2 border-t border-border-subtle pt-3">
                                {group.items.length === 0 && <p className="text-xs text-text-muted">Nothing recorded yet.</p>}
                                {group.items.map((item) => {
                                    const value = group.kind === "account"
                                        ? accountBalance(item as typeof data.accounts[number], data.transactions)
                                        : group.kind === "investment"
                                            ? investmentValue(item as typeof data.investments[number], data.transactions)
                                            : (item as typeof data.liabilities[number]).balance;
                                    return (
                                        <div key={item.id} className="flex flex-wrap items-center gap-2 text-xs">
                                            <span className="mr-auto truncate text-text-primary">{item.name}</span>
                                            <span className="text-text-secondary">{formatCurrency(value)}</span>
                                            <button className="text-primary" onClick={() => open(group.kind, item.id)}>Edit</button>
                                            <button className="text-danger" onClick={() => setTarget({ kind: group.kind, id: item.id, name: item.name })}>Delete</button>
                                        </div>
                                    );
                                })}
                                <button className="text-xs font-medium text-primary hover:underline" onClick={() => open(group.kind)}>+ Add {group.kind}</button>
                            </div>
                        </article>
                    ))}
                    <article className="rounded-2xl border border-border bg-surface p-5">
                        <p className="text-sm text-text-secondary">Net worth</p>
                        <p className="mt-4 text-2xl font-semibold text-text-primary">{formatCurrency(snapshot.netWorth)}</p>
                        <div className="mt-4 space-y-1 border-t border-border-subtle pt-3 text-xs text-text-secondary">
                            <p>Bank balance + {formatCurrency(snapshot.bank)}</p>
                            <p>Investments + {formatCurrency(snapshot.investments)}</p>
                            <p>Outstanding debt − {formatCurrency(snapshot.debt)}</p>
                        </div>
                    </article>
                </div>
            </section>
            <section className="space-y-3" aria-labelledby="monthly-title">
                <div>
                    <h2 id="monthly-title" className="text-base font-semibold text-text-primary">Monthly overview</h2>
                    <p className="text-xs text-text-secondary">Income and ordinary spending this month</p>
                    {data.transactions.some((item) => item.demoAccount && item.date.startsWith(month)) && (
                        <p className="mt-1 text-xs text-text-muted">
                            Includes seeded demo expenses. These are visible in Expenses but do not affect bank balances.
                        </p>
                    )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                        { label: "Income", value: formatCurrency(activity.income) },
                        { label: "Expenses", value: formatCurrency(activity.expenses) },
                        { label: "Net cash flow", value: formatCurrency(activity.netCashFlow) },
                        { label: "Savings rate", value: activity.savingsRate === null ? "—" : `${activity.savingsRate.toFixed(1)}%` },
                    ].map((item) => (
                        <article key={item.label} className="rounded-2xl border border-border bg-surface p-5">
                            <p className="text-sm text-text-secondary">{item.label}</p>
                            <p className="mt-4 text-2xl font-semibold text-text-primary">{item.value}</p>
                        </article>
                    ))}
                </div>
            </section>
            <FinanceCharts data={chartData} hasSnapshot={hasSnapshot} />
            <CategoryBreakdownChart data={categories} />
            <section className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-text-primary">Recent transactions</h2>
                    <Link href="/finance/expenses" className="text-sm text-primary hover:underline">Expenses</Link>
                </div>
                {recent.length === 0 && <p className="mt-4 text-sm text-text-muted">No transactions yet.</p>}
                <div className="mt-3 divide-y divide-border-subtle">
                    {recent.map((item) => (
                        <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                            <div>
                                <p className="text-sm font-medium text-text-primary">{item.description}</p>
                                <p className="text-xs capitalize text-text-secondary">{item.type.replaceAll("_", " ")} · {formatDateDisplay(item.date)}</p>
                                {item.demoAccount && <p className="text-xs text-text-muted">Demo record</p>}
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-semibold text-text-primary">
                                    {item.type === "income" || item.type === "investment_sale" ? "+" : item.type === "transfer" ? "↔ " : "−"}{formatCurrency(item.amount)}
                                </span>
                                {item.type !== "expense" && <button className="text-xs text-primary" onClick={() => open("transaction", item.id)}>Edit</button>}
                                {item.type !== "expense" && <button className="text-xs text-danger" onClick={() => setTarget({ kind: "transaction", id: item.id, name: item.description })}>Delete</button>}
                            </div>
                        </div>
                    ))}
                </div>
            </section>
            {manager && <FinanceManager key={`${manager}-${editId || "new"}`} kind={manager}
                editId={editId} onClose={() => setManager(null)} />}
            <DeleteModal open={target !== null} onOpenChange={(value) => !value && setTarget(null)}
                title={`Delete ${target?.name || "item"}?`}
                description="This action cannot be undone. Items with linked transactions cannot be removed."
                confirmText="Delete" onConfirm={remove} />
        </div>
    );
}
