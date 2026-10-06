import { CircleDollarSign, HeartPulse, Target, Wallet } from "lucide-react";
import { Stat } from "@/components/ui";
import { overviewStats } from "../data/mock-data";

const icons = [
    Wallet,
    Target,
    HeartPulse,
    CircleDollarSign,
];

export function OverviewStats() {
    return (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {overviewStats.map((stat, index) => (
                <Stat
                    key={stat.label}
                    label={stat.label}
                    value={stat.value}
                    description={stat.description}
                    trend={stat.trend}
                    icon={icons[index]}
                />
            ))}
        </section>
    );
}