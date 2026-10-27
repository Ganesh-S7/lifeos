import {
    ChartSkeleton,
    ListSkeleton,
    Skeleton,
    SkeletonRegion,
    StatCardsSkeleton,
} from "@/components/ui";

export function FinanceOverviewSkeleton() {
    return (
        <SkeletonRegion label="Loading your finance data" className="space-y-5 md:space-y-7 lg:space-y-8">
            <section className="space-y-3">
                <div>
                    <h2 className="text-base font-semibold text-text-primary">Overall financial snapshot</h2>
                    <p className="text-xs text-text-secondary">Current balances, valuations and debt</p>
                </div>
                <StatCardsSkeleton className="md:min-h-48" actions />
            </section>
            <section className="space-y-3">
                <div>
                    <h2 className="text-base font-semibold text-text-primary">Monthly overview</h2>
                    <p className="text-xs text-text-secondary">Income and ordinary spending through today</p>
                </div>
                <StatCardsSkeleton className="md:min-h-30" />
            </section>
            <div className="grid gap-4 xl:grid-cols-2 [&>section:not(:first-child)]:hidden md:[&>section]:block">
                {["Net worth trend", "Cash flow"].map((title) => (
                    <section key={title} className="min-w-0 rounded-xl border border-border bg-surface p-3 md:p-5">
                        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
                        <Skeleton variant="text" className="mt-2 w-48" />
                        <ChartSkeleton className="mt-5 lg:h-72" />
                    </section>
                ))}
            </div>
            <section className="hidden min-w-0 rounded-xl border border-border bg-surface p-3 md:block md:p-5">
                <h2 className="text-sm font-semibold text-text-primary">Spending by category</h2>
                <div className="mt-5 space-y-5">
                    {[80, 60, 45, 30].map((width) => (
                        <div key={width} className="flex items-center gap-4">
                            <Skeleton variant="text" className="w-20 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <Skeleton className="h-6" style={{ width: `${width}%` }} />
                            </div>
                        </div>
                    ))}
                </div>
            </section>
            <section className="min-w-0 rounded-xl border border-border bg-surface p-3 md:p-5">
                <h2 className="text-sm font-semibold text-text-primary">Recent transactions</h2>
                <div className="mt-3"><ListSkeleton /></div>
            </section>
        </SkeletonRegion>
    );
}
