import { ArrowUpRight, MoreHorizontal } from "lucide-react";
import { Card, IconButton } from "@/components/ui";
import { spendingData } from "../data/mock-data";

const maxValue = Math.max(...spendingData.map((item) => item.value));

export function SpendingOverview() {
    return (
        <Card className="overflow-hidden">
            <div className="flex items-start justify-between p-5">
                <div>
                    <p className="text-sm font-semibold text-text-primary">
                        Spending overview
                    </p>

                    <p className="mt-1 text-xs text-text-secondary">
                        October · compared with last month
                    </p>
                </div>

                <IconButton size="sm" aria-label="More options">
                    <MoreHorizontal className="size-4" />
                </IconButton>
            </div>

            <div className="px-5 pb-5">
                <div className="flex items-end gap-3">
                    <p className="text-3xl font-semibold tracking-tight text-text-primary">
                        ₹16,240
                    </p>

                    <div className="mb-1 flex items-center gap-1 text-xs font-medium text-success">
                        <ArrowUpRight className="size-3.5" />
                        8.4%
                    </div>
                </div>

                <div className="mt-7 space-y-4">
                    {spendingData.map((item) => {
                        const width = (item.value / maxValue) * 100;

                        return (
                            <div key={item.label}>
                                <div className="mb-2 flex items-center justify-between text-xs">
                                    <span className="text-text-secondary">
                                        {item.label}
                                    </span>

                                    <span className="font-medium text-text-primary">
                                        ₹{item.value.toLocaleString("en-IN")}
                                    </span>
                                </div>

                                <div className="h-1.5 overflow-hidden rounded-full bg-surface-elevated">
                                    <div
                                        className="h-full rounded-full bg-primary transition-all"
                                        style={{ width: `${width}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </Card>
    );
}