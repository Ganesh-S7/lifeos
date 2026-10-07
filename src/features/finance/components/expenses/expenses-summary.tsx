import {
    ArrowDownRight,
    ArrowUpRight,
    Receipt,
    Wallet,
} from "lucide-react";

import { Stat } from "@/components/ui";

const stats = [
    {
        label: "This month",
        value: "₹8,403",
        description: "8.4% lower than September",
        trend: "down" as const,
        icon: Wallet,
    },
    {
        label: "Today",
        value: "₹480",
        description: "2 transactions today",
        trend: "neutral" as const,
        icon: Receipt,
    },
    {
        label: "Daily average",
        value: "₹933",
        description: "Based on October so far",
        trend: "up" as const,
        icon: ArrowUpRight,
    },
    {
        label: "Transactions",
        value: "8",
        description: "This month",
        trend: "neutral" as const,
        icon: ArrowDownRight,
    },
];

export function ExpensesSummary() {
    return (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
                <Stat
                    key={stat.label}
                    label={stat.label}
                    value={stat.value}
                    description={stat.description}
                    trend={stat.trend}
                    icon={stat.icon}
                />
            ))}
        </section>
    );
}