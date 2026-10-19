"use client";

import { useRef } from "react";
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    ListSkeleton,
    LoadError,
    SkeletonRegion,
} from "@/components/ui";
import { formatCurrency } from "@/lib/utils/currency";
import { useFinance } from "../../store/finance-store";
import { accountBalance, investmentValue } from "../../utils/finance-calculations";

export type FinanceSection = "account" | "investment" | "liability";

interface ManageFinancesDialogProps {
    open: boolean;
    activeTab: FinanceSection;
    error: string;
    onOpenChange: (open: boolean) => void;
    onTabChange: (tab: FinanceSection) => void;
    onAdd: (tab: FinanceSection) => void;
    onEdit: (tab: FinanceSection, id: string) => void;
    onDelete: (tab: FinanceSection, id: string, name: string) => void;
}

const sections: { id: FinanceSection; label: string; addLabel: string; empty: string; }[] = [
    {
        id: "account",
        label: "Bank accounts",
        addLabel: "Add account",
        empty: "No bank accounts yet. Add one to track your balance.",
    },
    {
        id: "investment",
        label: "Investments",
        addLabel: "Add investment",
        empty: "No investments yet. Add one to track its current valuation.",
    },
    {
        id: "liability",
        label: "Liabilities",
        addLabel: "Add liability",
        empty: "No liabilities yet. Add one to track its outstanding balance.",
    },
];

export function ManageFinancesDialog({
    open,
    activeTab,
    error,
    onOpenChange,
    onTabChange,
    onAdd,
    onEdit,
    onDelete,
}: ManageFinancesDialogProps) {
    const { data, ready, loadError, retry } = useFinance();
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const section = sections.find((item) => item.id === activeTab) ?? sections[0];
    const items = activeTab === "account" ? data.accounts
        : activeTab === "investment" ? data.investments : data.liabilities;

    function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
        let nextIndex: number;
        switch (event.key) {
            case "ArrowRight":
                nextIndex = (index + 1) % sections.length;
                break;
            case "ArrowLeft":
                nextIndex = (index - 1 + sections.length) % sections.length;
                break;
            case "Home":
                nextIndex = 0;
                break;
            case "End":
                nextIndex = sections.length - 1;
                break;
            default:
                return;
        }
        event.preventDefault();
        onTabChange(sections[nextIndex].id);
        tabRefs.current[nextIndex]?.focus();
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[min(90vh,48rem)] max-w-2xl flex-col overflow-hidden p-0">
                <div className="px-5 pt-5 sm:px-6 sm:pt-6">
                    <DialogHeader>
                        <DialogTitle>Manage finances</DialogTitle>
                        <DialogDescription>
                            Maintain your accounts, investment valuations, and outstanding debt.
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div
                    role="tablist"
                    aria-label="Financial records"
                    className="flex gap-1 overflow-x-auto border-b border-border px-5 sm:px-6"
                >
                    {sections.map((item, index) => (
                        <button
                            key={item.id}
                            ref={(element) => {
                                tabRefs.current[index] = element;
                            }}
                            id={`finance-tab-${item.id}`}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === item.id}
                            aria-controls="finance-panel"
                            tabIndex={activeTab === item.id ? 0 : -1}
                            onClick={() => onTabChange(item.id)}
                            onKeyDown={(event) => handleTabKeyDown(event, index)}
                            className={
                                "shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition-colors " +
                                (activeTab === item.id
                                    ? "text-text-primary"
                                    : "border-transparent text-text-secondary hover:text-text-primary")
                            }
                            style={{
                                borderBottomColor:
                                    activeTab === item.id ? "var(--brand)" : "transparent",
                            }}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>

                <div
                    id="finance-panel"
                    role="tabpanel"
                    aria-labelledby={`finance-tab-${activeTab}`}
                    tabIndex={0}
                    className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6"
                >
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-semibold text-text-primary">
                                {section.label}
                            </h3>
                            <p className="mt-0.5 text-xs text-text-muted">
                                {items.length} {items.length === 1 ? "record" : "records"}
                            </p>
                        </div>
                        <Button size="sm" disabled={!ready} onClick={() => onAdd(activeTab)}>
                            + {section.addLabel}
                        </Button>
                    </div>

                    {error && (
                        <p role="alert" className="mb-4 rounded-lg bg-danger-subtle p-3 text-sm text-danger">
                            {error}
                        </p>
                    )}

                    {!ready ? (
                        loadError ? <LoadError message={loadError} onRetry={retry} /> : (
                            <SkeletonRegion label={`Loading ${section.label.toLowerCase()}`}>
                                <ListSkeleton rows={3} />
                            </SkeletonRegion>
                        )
                    ) : items.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border bg-surface-subtle px-5 py-10 text-center">
                            <p className="text-sm text-text-secondary">
                                {section.empty}
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border-subtle rounded-xl border border-border">
                            {items.map((item) => {
                                const value = activeTab === "account"
                                    ? accountBalance(item as typeof data.accounts[number], data.transactions)
                                    : activeTab === "investment"
                                        ? investmentValue(item as typeof data.investments[number], data.transactions)
                                        : (item as typeof data.liabilities[number]).balance;
                                const hasTransactions = activeTab === "account"
                                    ? data.transactions.some((transaction) =>
                                        transaction.accountId === item.id ||
                                        transaction.destinationAccountId === item.id)
                                    : activeTab === "investment"
                                        ? data.transactions.some((transaction) => transaction.investmentId === item.id)
                                        : false;
                                const kind = "type" in item ? item.type : "Bank account";

                                return (
                                    <div key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-text-primary">
                                                {item.name}
                                            </p>
                                            <p className="mt-0.5 text-xs text-text-muted">{kind}</p>
                                        </div>
                                        <p className="text-sm font-semibold tabular-nums text-text-primary">
                                            {formatCurrency(value)}
                                        </p>
                                        <div className="flex items-center gap-3 text-xs">
                                            <button
                                                type="button"
                                                className="font-medium text-primary hover:underline"
                                                onClick={() => onEdit(activeTab, item.id)}
                                                aria-label={`Edit ${item.name}`}
                                            >
                                                Edit
                                            </button>
                                            {!hasTransactions && (
                                                <button
                                                    type="button"
                                                    className="font-medium text-danger hover:underline"
                                                    onClick={() => onDelete(activeTab, item.id, item.name)}
                                                    aria-label={`Delete ${item.name}`}
                                                >
                                                    Delete
                                                </button>
                                            )}
                                        </div>
                                        {hasTransactions && (
                                            <p className="w-full text-xs text-text-muted">
                                                Linked transactions prevent deletion. Remove those transactions first.
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                <div className="flex justify-end border-t border-border px-5 py-3 sm:px-6">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
