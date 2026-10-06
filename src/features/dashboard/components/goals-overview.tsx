import { ArrowRight, Target } from "lucide-react";
import { Badge, Card, Progress } from "@/components/ui";

export function GoalsOverview() {
    return (
        <Card>
            <div className="flex items-start justify-between p-5">
                <div>
                    <p className="text-sm font-semibold text-text-primary">
                        Current goal
                    </p>

                    <p className="mt-1 text-xs text-text-secondary">
                        Emergency fund
                    </p>
                </div>

                <Target className="size-4 text-primary" />
            </div>

            <div className="px-5 pb-5">
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <p className="text-2xl font-semibold tracking-tight text-text-primary">
                            ₹1,24,000
                        </p>

                        <p className="mt-1 text-xs text-text-muted">
                            of ₹2,00,000 target
                        </p>
                    </div>

                    <Badge variant="brand">62%</Badge>
                </div>

                <Progress value={62} className="mt-5" />

                <div className="mt-5 flex items-center justify-between">
                    <p className="text-xs text-text-secondary">
                        ₹76,000 remaining
                    </p>

                    <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary transition hover:text-primary-hover"
                    >
                        View goal
                        <ArrowRight className="size-3.5" />
                    </button>
                </div>
            </div>
        </Card>
    );
}