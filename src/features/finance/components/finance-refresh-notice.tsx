"use client";

import { Button } from "@/components/ui";

export function FinanceRefreshNotice({
    message,
    refreshing,
    onRetry,
}: {
    message: string;
    refreshing: boolean;
    onRetry: () => void;
}) {
    if (!message && !refreshing) return null;
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
            <p role={message ? "alert" : "status"} className="text-sm text-text-secondary">
                {message || "Refreshing finance data…"}
            </p>
            {message && (
                <Button size="sm" variant="outline" onClick={onRetry} disabled={refreshing}>
                    Retry refresh
                </Button>
            )}
        </div>
    );
}
