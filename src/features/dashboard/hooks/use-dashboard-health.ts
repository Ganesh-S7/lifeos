"use client";

import { authClient } from "@/lib/auth-client";
import { useHealthHydration, useHealthStore } from "@/features/health/store/health-store";

/** Share Health's authenticated store without exposing an old account's snapshot. */
export function useDashboardHealth() {
    const { data: session, isPending } = authClient.useSession();
    const userId = session?.user.id;
    useHealthHydration(userId, isPending);

    const state = useHealthStore();
    const currentUser = !isPending && Boolean(userId) && state.activeUserId === userId;
    const failed = currentUser && Boolean(state.loadError);
    const ready = currentUser && state.ready && !failed;

    return {
        ready,
        failed,
        logs: ready ? state.logs : [],
        targets: ready ? state.targets : null,
        retry() {
            if (userId && !isPending) {
                void state.initializeForUser(userId);
            }
        },
    };
}
