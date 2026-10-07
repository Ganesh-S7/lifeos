import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card } from "@/components/ui";

export default function FinancePage() {
    return (
        <div className="space-y-6">
            <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-medium text-primary">
                        Finance
                    </p>

                    <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">
                        Financial overview
                    </h1>

                    <p className="mt-1.5 text-sm text-text-secondary">
                        Understand your money, spending and savings in one place.
                    </p>
                </div>

                <Link
                    href="/finance/expenses"
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-transparent px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-elevated"
                >
                    View expenses
                    <ArrowRight className="size-4" />
                </Link>
            </section>

            <Card className="flex min-h-64 items-center justify-center">
                <div className="text-center">
                    <p className="text-sm font-medium text-text-primary">
                        Finance overview
                    </p>

                    <p className="mt-1 text-xs text-text-secondary">
                        We&apos;ll build the complete overview after the expenses experience.
                    </p>
                </div>
            </Card>
        </div>
    );
}