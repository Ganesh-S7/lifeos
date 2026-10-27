import Link from "next/link";
import { Target } from "lucide-react";
import { Card } from "@/components/ui";

export function GoalsOverview() {
    return (
        <Card className="border-0 border-t border-border-subtle bg-transparent shadow-none md:border md:bg-surface md:shadow-sm">
            <div className="flex items-start justify-between py-3 md:p-5">
                <p className="text-sm font-semibold text-text-primary">Current goal</p>
                <Target className="size-4 text-primary" />
            </div>
            <div className="space-y-2 pb-2 md:space-y-5 md:px-5 md:pb-5">
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
