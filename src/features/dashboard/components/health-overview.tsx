import { Moon, Footprints, Flame, Dumbbell } from "lucide-react";
import { Card, Progress } from "@/components/ui";

const metrics = [
    {
        label: "Calories",
        value: "1,840",
        target: "2,200 kcal",
        progress: 84,
        icon: Flame,
    },
    {
        label: "Protein",
        value: "112 g",
        target: "140 g",
        progress: 80,
        icon: Dumbbell,
    },
    {
        label: "Steps",
        value: "7,420",
        target: "10,000",
        progress: 74,
        icon: Footprints,
    },
    {
        label: "Sleep",
        value: "7h 18m",
        target: "8h",
        progress: 91,
        icon: Moon,
    },
];

export function HealthOverview() {
    return (
        <Card>
            <div className="border-b border-border-subtle p-5">
                <p className="text-sm font-semibold text-text-primary">
                    Today
                </p>

                <p className="mt-1 text-xs text-text-secondary">
                    Health & activity
                </p>
            </div>

            <div className="grid grid-cols-2 divide-x divide-y divide-border-subtle sm:grid-cols-4 sm:divide-y-0">
                {metrics.map((metric) => {
                    const Icon = metric.icon;

                    return (
                        <div key={metric.label} className="p-5">
                            <div className="flex items-center gap-2 text-text-muted">
                                <Icon className="size-3.5" />
                                <span className="text-[11px]">{metric.label}</span>
                            </div>

                            <p className="mt-3 text-lg font-semibold text-text-primary">
                                {metric.value}
                            </p>

                            <p className="mt-1 text-[11px] text-text-muted">
                                {metric.target}
                            </p>

                            <Progress
                                value={metric.progress}
                                className="mt-3 h-1"
                            />
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}