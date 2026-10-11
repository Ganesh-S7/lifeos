"use client";

import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui";
import { formatCurrency } from "@/lib/utils/currency";

interface NetWorthBreakdownDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    bank: number;
    investments: number;
    debt: number;
    netWorth: number;
}

export function NetWorthBreakdownDialog({
    open,
    onOpenChange,
    bank,
    investments,
    debt,
    netWorth,
}: NetWorthBreakdownDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Net worth breakdown</DialogTitle>
                    <DialogDescription>
                        Current bank balance plus investments, less outstanding debt.
                    </DialogDescription>
                </DialogHeader>
                <dl className="mt-6 space-y-3 text-sm">
                    <div className="flex justify-between gap-4 text-text-secondary">
                        <dt>Bank balance</dt>
                        <dd className="tabular-nums">{formatCurrency(bank)}</dd>
                    </div>
                    <div className="flex justify-between gap-4 text-text-secondary">
                        <dt>Investments</dt>
                        <dd className="tabular-nums">{formatCurrency(investments)}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-border pt-3 font-medium text-text-primary">
                        <dt>Total financial assets</dt>
                        <dd className="tabular-nums">{formatCurrency(bank + investments)}</dd>
                    </div>
                    <div className="flex justify-between gap-4 text-text-secondary">
                        <dt>Outstanding debt</dt>
                        <dd className="tabular-nums">−{formatCurrency(debt)}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-border pt-3 text-base font-semibold text-text-primary">
                        <dt>Net worth</dt>
                        <dd className={`tabular-nums ${netWorth < 0 ? "text-danger" : "text-success"}`}>
                            {formatCurrency(netWorth)}
                        </dd>
                    </div>
                </dl>
                <div className="mt-6 flex justify-end">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
