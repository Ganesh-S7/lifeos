"use client";

import { useEffect, useSyncExternalStore } from "react";
import { authClient } from "@/lib/auth-client";
import type { FinanceData } from "../types/finance";
import { financeApi } from "../api/finance-api";
import { createFinanceStore, initialFinanceState } from "./finance-store-core";

const store = createFinanceStore(financeApi);

/** Every consumer shares the same session-aware initialization and external snapshot. */
export function useFinance() {
    const { data: session, isPending } = authClient.useSession();
    const userId = session?.user.id ?? null;
    const snapshot = useSyncExternalStore(
        store.subscribe,
        store.getSnapshot,
        () => initialFinanceState,
    );

    useEffect(() => {
        // Pending authentication must not trigger a Finance request.
        void store.setSession(isPending ? null : userId);
    }, [userId, isPending]);

    // Mask stale data during render, before the session effect clears the shared store.
    const visible = !isPending && userId && snapshot.userId === userId
        ? snapshot : initialFinanceState;
    const data: FinanceData = visible.data;
    return {
        ...visible,
        data,
        userId,
        loadError: !isPending && !userId ? "Sign in to view your finance data." : visible.loadError,
        retry: () => {
            void store.retry();
        },
    };
}

export const financeActions = store.actions;
