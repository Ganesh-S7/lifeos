"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Banknote, HeartPulse, Plus, ReceiptText } from "lucide-react";
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui";
import { notify } from "@/lib/notifications";
import { formatDateValue } from "@/lib/utils/date";
import { AddExpenseDialog } from "@/features/finance/components/expenses/add-expense-dialog";
import { FinanceManager } from "@/features/finance/components/overview/finance-manager";
import type { ExpenseFormValues } from "@/features/finance/schemas/expense-schema";
import { financeActions, useFinance } from "@/features/finance/store/finance-store";
import { expenseToTransaction } from "@/features/finance/utils/expense-transactions";
import { HealthLogDialog } from "@/features/health/components/health-log-dialog";
import { useDashboardHealth } from "../hooks/use-dashboard-health";

type QuickAddAction = "income" | "expense" | "health";

export function QuickAdd() {
    const { userId } = useFinance();
    return <QuickAddContent key={userId ?? "signed-out"} />;
}

function QuickAddContent() {
    const finance = useFinance();
    const health = useDashboardHealth();
    const trigger = useRef<HTMLButtonElement>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [action, setAction] = useState<QuickAddAction | null>(null);
    const [expenseError, setExpenseError] = useState("");
    const financeAction = action === "income" || action === "expense";
    const needsAccount = finance.ready && financeAction && finance.data.accounts.length === 0;

    function select(next: QuickAddAction) {
        setMenuOpen(false);
        setExpenseError("");
        setAction(next);
    }

    function close() {
        setAction(null);
        setExpenseError("");
        requestAnimationFrame(() => trigger.current?.focus());
    }

    async function saveExpense(values: ExpenseFormValues) {
        try {
            await financeActions.saveTransaction(
                expenseToTransaction({
                    amount: values.amount,
                    merchant: values.merchant,
                    category: values.category,
                    account: values.account,
                    date: formatDateValue(values.date),
                    note: values.note || undefined,
                }),
            );
            setExpenseError("");
            notify.success("Expense saved.");
            return true;
        } catch (cause) {
            setExpenseError(cause instanceof Error ? cause.message : "Could not save expense.");
            notify.error("Unable to save this expense.", {
                description: "Review the form and account balance, then try again.",
            });
            return false;
        }
    }

    return (
        <>
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                    <Button ref={trigger}>
                        <Plus className="size-4" aria-hidden="true" />
                        Quick add
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    className="w-64"
                    onCloseAutoFocus={(event) => {
                        // Let the selected dialog own focus when the menu closes.
                        if (action !== null) event.preventDefault();
                    }}
                >
                    <DropdownMenuItem disabled={!finance.ready} onSelect={() => select("income")}>
                        <Banknote className="size-4" aria-hidden="true" /> Add Income
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!finance.ready} onSelect={() => select("expense")}>
                        <ReceiptText className="size-4" aria-hidden="true" /> Add Expense
                    </DropdownMenuItem>
                    {!finance.ready && (
                        <p className="px-2.5 py-2 text-xs text-text-secondary" role="status">
                            {finance.loadError ? "Finance is unavailable. Retry below." : "Loading your Finance data…"}
                        </p>
                    )}
                    {finance.loadError && (
                        <DropdownMenuItem onSelect={finance.retry}>Retry Finance</DropdownMenuItem>
                    )}
                    <DropdownMenuItem disabled={!health.ready} onSelect={() => select("health")}>
                        <HeartPulse className="size-4" aria-hidden="true" /> Log Health
                    </DropdownMenuItem>
                    {!health.ready && (
                        <p className="px-2.5 py-2 text-xs text-text-secondary" role="status">
                            {health.failed ? "Health is unavailable. Retry below." : "Loading your Health data…"}
                        </p>
                    )}
                    {health.failed && (
                        <DropdownMenuItem onSelect={health.retry}>Retry Health</DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog
                open={needsAccount}
                onOpenChange={(open) => {
                    if (!open) close();
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add a bank account first</DialogTitle>
                        <DialogDescription>
                            Income and expenses need a registered bank account. Create one in Finance, then return to Quick add.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-5 flex justify-end">
                        <Link
                            href="/finance"
                            className="text-sm font-medium text-primary hover:underline"
                            onClick={close}
                        >
                            Open Finance
                        </Link>
                    </div>
                </DialogContent>
            </Dialog>
            {finance.ready && !needsAccount && action === "income" && (
                <FinanceManager kind="transaction" onClose={close} />
            )}
            {finance.ready && !needsAccount && action === "expense" && (
                <AddExpenseDialog
                    open
                    accounts={finance.data.accounts.map((account) => ({
                        label: account.name,
                        value: account.id,
                    }))}
                    error={expenseError}
                    onSubmit={saveExpense}
                    onOpenChange={(open) => {
                        if (!open) close();
                    }}
                />
            )}
            {health.ready && action === "health" && (
                <HealthLogDialog
                    open
                    onOpenChange={(open) => {
                        if (!open) close();
                    }}
                />
            )}
        </>
    );
}
