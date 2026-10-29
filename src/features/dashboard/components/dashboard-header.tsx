"use client";

import { useSyncExternalStore } from "react";
import { authClient } from "@/lib/auth-client";
import {
    getDashboardClockSnapshot,
    getServerDashboardClockSnapshot,
    subscribeDashboardClock,
} from "../utils/dashboard-clock";
import { QuickAdd } from "./quick-add";

export function DashboardHeader() {
    const { data: session } = authClient.useSession();
    const clock = useSyncExternalStore(
        subscribeDashboardClock,
        getDashboardClockSnapshot,
        getServerDashboardClockSnapshot,
    );
    const [date, greeting] = clock?.split("|") ?? ["Today", "Hello"];
    const name = clock === null ? "" : session?.user.name?.trim();

    return (
        <section className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 md:flex md:flex-row md:items-end md:justify-between">
            <div>
                <p className="text-[10px] md:text-xs font-medium uppercase tracking-[0.14em] text-primary">
                    {date}
                </p>

                <h1 className="mt-1 md:mt-2 text-xl font-semibold tracking-tight text-text-primary md:text-3xl">
                    {greeting}{name ? `, ${name}` : ""}.
                </h1>

                <p className="hidden md:block mt-1 max-w-xl text-sm leading-6 text-text-secondary">
                    Here’s a quick look at how things are going across your life.
                </p>
            </div>

            <QuickAdd />
        </section>
    );
}
