"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, DeleteModal, LoadError, Stat } from "@/components/ui";
import { useFinanceMutation } from "../../hooks/use-finance-mutation";
import { notify } from "@/lib/notifications";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateDisplay, formatDateValue } from "@/lib/utils/date";
import { financeActions, useFinance } from "../../store/finance-store";
import { categorySpending, financialSnapshot, monthlyActivity } from "../../utils/finance-calculations";
import { monthlyActivityComparison, overallPositionComparison } from "../../utils/finance-comparisons";
import { CategoryBreakdownChart } from "./category-breakdown-chart";
import { FinanceCharts } from "./finance-charts";
import { FinanceOverviewSkeleton } from "./finance-overview-skeleton";
import { FinanceRefreshNotice } from "../finance-refresh-notice";
import { FinanceComparison } from "./finance-comparison";
import { FinanceManager, type ManagerKind } from "./finance-manager";
import { ManageFinancesDialog, type FinanceSection } from "./manage-finances-dialog";
import { NetWorthBreakdownDialog } from "./net-worth-breakdown-dialog";
import {
    ArrowLeftRight,
    ArrowRight,
    Banknote,
    CreditCard,
    Percent,
    ReceiptText,
    Scale,
    TrendingUp,
    Wallet,
} from "lucide-react";

export function FinanceOverview() {
    const { userId } = useFinance();
    return <FinanceOverviewContent key={userId ?? "signed-out"} />;
}

function FinanceOverviewContent() {
    const { data, ready, loadError, refreshError, refreshing, retry } = useFinance();
    const [manager, setManager] = useState<ManagerKind | null>(null);
    const [manageOpen, setManageOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<FinanceSection>("account");
    const [breakdownOpen, setBreakdownOpen] = useState(false);
    const [editId, setEditId] = useState<string>();
    const [target, setTarget] = useState<{ kind: ManagerKind; id: string; name: string; } | null>(null);
    const [error, setError] = useState("");
    const deletion = useFinanceMutation();
    const now = new Date();
    const month = formatDateValue(now).slice(0, 7);
    const snapshot = financialSnapshot(data);
    const positionComparisons = overallPositionComparison(snapshot, data.positionHistory, now);
    const hasSnapshot = data.accounts.length + data.investments.length + data.liabilities.length > 0;
    const activityComparisons = monthlyActivityComparison(data.transactions, now);
    const activity = activityComparisons.current;
    const categories = categorySpending(data.transactions, month);
    const recent = [...data.transactions].sort((a, b) =>
        b.date.localeCompare(a.date) || b.recordedAt.localeCompare(a.recordedAt)).slice(0, 5);
    const chartData = Array.from({ length: 6 }, (_, index) => {
        const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
        const key = formatDateValue(date).slice(0, 7);
        const hasRecords = data.transactions.some((item) => item.date.startsWith(key));
        const values = monthlyActivity(data.transactions, key);
        const sample = index < 5 && !hasRecords;
        return {
            month: date.toLocaleDateString("en-IN", { month: "short" }),
            income: index === 5 ? activity.income
                : sample ? [32000, 37000, 34000, 39000, 36000][index] : values.income,
            expenses: index === 5 ? activity.expenses
                : sample ? [22000, 26000, 24000, 28000, 25000][index] : values.expenses,
            netWorth: index === 5 ? snapshot.netWorth : hasSnapshot
                ? snapshot.netWorth - (5 - index) * 2500 : 0,
        };
    });

    function open(kind: ManagerKind, id?: string) {
        setEditId(id);
        setManager(kind);
        setError("");
    }

    function openManage(tab: FinanceSection = "account") {
        setActiveTab(tab);
        setManageOpen(true);
        setError("");
    }

    async function remove() {
        if (!target) return;
        return deletion.run(async () => {
            if (target.kind === "account") await financeActions.deleteAccount(target.id);
            if (target.kind === "investment") await financeActions.deleteInvestment(target.id);
            if (target.kind === "liability") await financeActions.deleteLiability(target.id);
            if (target.kind === "transaction") await financeActions.deleteTransaction(target.id);
            return true;
        }, {
            onSuccess: () => {
                setError("");
                const label = target.kind === "account" ? "Bank account"
                    : target.kind === "investment" ? "Investment"
                        : target.kind === "liability" ? "Liability" : "Transaction";
                notify.success(`${label} deleted.`);
                setTarget(null);
            },
            onError: (cause) => {
                setError(cause instanceof Error ? cause.message : "Could not delete item.");
                notify.error("Unable to delete this item.", {
                    description: "Review any linked transactions and try again.",
                });
            },
        });
    }

    const groups = [
        {
            kind: "account" as const,
            label: "Bank balance",
            value: snapshot.bank,
            icon: Wallet,
            comparison: positionComparisons.bank,
            description:
                data.accounts.length === 0
                    ? "No bank accounts yet"
                    : `Across ${data.accounts.length} bank ${data.accounts.length === 1 ? "account" : "accounts"
                    }`,
            action: "View accounts",
        },
        {
            kind: "investment" as const,
            label: "Investments",
            value: snapshot.investments,
            icon: TrendingUp,
            comparison: positionComparisons.investments,
            description:
                data.investments.length === 0
                    ? "No investments yet"
                    : `Across ${data.investments.length} ${data.investments.length === 1 ? "investment" : "investments"
                    }`,
            action: "View investments",
        },
        {
            kind: "liability" as const,
            label: "Outstanding debt",
            value: snapshot.debt,
            icon: CreditCard,
            comparison: positionComparisons.debt,
            description:
                data.liabilities.length === 0
                    ? "No liabilities yet"
                    : `Across ${data.liabilities.length} ${data.liabilities.length === 1 ? "liability" : "liabilities"
                    }`,
            action: "View liabilities",
        },
    ];

    const monthCards = [
        {
            label: "Income",
            value: formatCurrency(activity.income),
            comparison: activityComparisons.income,
            unit: "currency" as const,
            icon: Banknote,
        },
        {
            label: "Expenses",
            value: formatCurrency(activity.expenses),
            comparison: activityComparisons.expenses,
            unit: "currency" as const,
            icon: ReceiptText,
        },
        {
            label: "Net cash flow",
            value: formatCurrency(activity.netCashFlow),
            comparison: activityComparisons.netCashFlow,
            unit: "currency" as const,
            icon: ArrowLeftRight,
        },
        {
            label: "Savings rate",
            value:
                activity.savingsRate === null
                    ? "—"
                    : `${activity.savingsRate.toFixed(1)}%`,
            comparison: activityComparisons.savingsRate,
            unit: "points" as const,
            icon: Percent,
        },
    ];

    return (
        <div className="space-y-7">
            <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Finance overview</h1>
                    <p className="mt-1 text-sm text-text-secondary">Your financial position and this month&apos;s activity.</p>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                    <Link
                        href="/finance/expenses"
                        className="rounded-lg group flex gap-1 items-center border border-border bg-surface px-3.5 py-2 text-sm text-text-primary"
                    >
                        Manage expenses
                        <ArrowRight size={12} className="group-hover:translate-x-1 duration-200 ease-in-out" />
                    </Link>
                </div>
            </header>
            {error && <p role="alert" className="rounded-lg bg-danger-subtle p-3 text-sm text-danger">{error}</p>}
            {!ready ? (
                loadError ? <LoadError message={loadError} onRetry={retry} /> : <FinanceOverviewSkeleton />
            ) : (
                <>
                    <FinanceRefreshNotice
                        message={refreshError}
                        refreshing={refreshing}
                        onRetry={retry}
                    />
                    <section className="space-y-3" aria-labelledby="snapshot-title">
                        <div className="flex justify-between items-center gap-4">
                            <div>
                                <h2 id="snapshot-title" className="text-base font-semibold text-text-primary">Overall financial snapshot</h2>
                                <p className="text-xs text-text-secondary">Current balances, valuations and debt</p>
                            </div>
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => openManage()}
                            >
                                Manage finances
                            </Button>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            {groups.map((group) => (
                                <Stat
                                    key={group.kind}
                                    icon={group.icon}
                                    className="min-h-48"
                                    label={group.label}
                                    value={formatCurrency(group.value)}
                                    description={group.description}
                                    footer={
                                        <FinanceComparison
                                            comparison={group.comparison}
                                            period="since last month"
                                            recordedValue={group.kind === "investment"}
                                        />
                                    }
                                    action={
                                        <button
                                            type="button"
                                            className="text-left flex gap-1 items-center group text-xs font-medium text-primary hover:underline underline-offset-3"
                                            onClick={() => openManage(group.kind)}
                                        >
                                            {group.action} <ArrowRight size={10} className="group-hover:translate-x-0.5 duration-200 ease-in-out" />
                                        </button>
                                    }
                                />
                            ))}
                            <Stat
                                icon={Scale}
                                className="min-h-48"
                                label="Net worth"
                                value={formatCurrency(snapshot.netWorth)}
                                description="Bank balance + investments − debt"
                                footer={
                                    <FinanceComparison
                                        comparison={positionComparisons.netWorth}
                                        period="since last month"
                                    />
                                }
                                action={
                                    <button
                                        type="button"
                                        className="text-left flex gap-1 items-center group text-xs font-medium text-primary hover:underline underline-offset-3"
                                        onClick={() => setBreakdownOpen(true)}
                                    >
                                        View breakdown <ArrowRight size={10} className="group-hover:translate-x-1 duration-200 ease-in-out" />
                                    </button>
                                }
                            />
                        </div>
                    </section>
                    <section className="space-y-3" aria-labelledby="monthly-title">
                        <div className="flex justify-between item gap-4">
                            <div>
                                <h2 id="monthly-title" className="text-base font-semibold text-text-primary">Monthly overview</h2>
                                <p className="text-xs text-text-secondary">Income and ordinary spending through today</p>
                            </div>
                            <Button
                                size="sm"
                                variant="secondary"
                                disabled={data.accounts.length === 0}
                                onClick={() => open("transaction")}
                            >
                                Record income or transfer
                            </Button>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            {monthCards.map((item) => (
                                <Stat
                                    key={item.label}
                                    icon={item.icon}
                                    className="min-h-30"
                                    label={item.label}
                                    value={item.value}
                                    description=""
                                    footer={
                                        <FinanceComparison
                                            comparison={item.comparison}
                                            period="vs previous period"
                                            unit={item.unit}
                                        />
                                    }
                                />
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
                </>
            )}
            <ManageFinancesDialog
                open={ready && manageOpen}
                activeTab={activeTab}
                error={error}
                onOpenChange={(open) => {
                    setManageOpen(open);
                    if (!open) setError("");
                }}
                onTabChange={(tab) => {
                    setActiveTab(tab);
                    setError("");
                }}
                onAdd={(tab) => open(tab)}
                onEdit={(tab, id) => open(tab, id)}
                onDelete={(tab, id, name) => setTarget({ kind: tab, id, name })}
            />
            {ready && manager && (
                <FinanceManager
                    key={`${manager}-${editId || "new"}`}
                    kind={manager}
                    editId={editId}
                    onClose={() => setManager(null)}
                />
            )}
            <NetWorthBreakdownDialog
                open={ready && breakdownOpen}
                onOpenChange={setBreakdownOpen}
                bank={snapshot.bank}
                investments={snapshot.investments}
                debt={snapshot.debt}
                netWorth={snapshot.netWorth}
            />
            <DeleteModal open={ready && target !== null} onOpenChange={(value) => {
                if (!value && !deletion.isPending()) setTarget(null);
            }}
                title={`Delete ${target?.name || "item"}?`}
                description={error || "This action cannot be undone. Items with linked transactions cannot be removed."}
                isLoading={deletion.isPendingState}
                confirmText="Delete" onConfirm={remove} />
        </div>
    );
}
