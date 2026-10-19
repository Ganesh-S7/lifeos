import Link from "next/link";
import { Target } from "lucide-react";
import { Card } from "@/components/ui";

export function GoalsOverview() {
    return (
        <Card>
            <div className="flex items-start justify-between p-5">
                <p className="text-sm font-semibold text-text-primary">Current goal</p>
                <Target className="size-4 text-primary" />
            </div>
            <div className="space-y-5 px-5 pb-5">
                <p className="text-sm text-text-secondary">
                    Financial goal tracking is not connected yet. No goal balance is available.
                </p>
                <Link href="/finance" className="text-xs font-medium text-primary hover:underline">
                    View your finances
                </Link>
            </div>
        </Card>
    );
}
