import {
    ChartSkeleton,
    ListSkeleton,
    Skeleton,
    SkeletonRegion,
    StatCardsSkeleton,
} from "@/components/ui";

export function HealthOverviewSkeleton() {
    return (
        <SkeletonRegion label="Loading your health data" className="space-y-7">
            <section className="space-y-3">
                <div>
                    <h2 className="text-base font-semibold text-text-primary">Health snapshot</h2>
                    <p className="text-xs text-text-secondary">
                        Your latest measurements and today&apos;s activity.
                    </p>
                </div>
                <StatCardsSkeleton />
            </section>

            <section className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="text-base font-semibold text-text-primary">Daily progress</h2>
                <Skeleton className="mt-2 h-8 w-48" />
                <div className="mt-6 grid gap-x-8 gap-y-6 md:grid-cols-2">
                    {Array.from({ length: 6 }, (_, index) => (
                        <div key={index} className="space-y-2">
                            <div className="flex justify-between gap-3">
                                <Skeleton variant="text" className="w-24" />
                                <Skeleton variant="text" className="w-20" />
                            </div>
                            <Skeleton className="h-2 w-full rounded-full" />
                            <Skeleton variant="text" className="w-32" />
                        </div>
                    ))}
                </div>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <h2 className="text-base font-semibold text-text-primary">Health analytics</h2>
                    <Skeleton className="h-9 w-40" />
                </div>
                <Skeleton variant="text" className="mt-3 w-48" />
                <ChartSkeleton className="mt-4 h-72" />
            </section>

            <section className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="text-base font-semibold text-text-primary">Recent health logs</h2>
                <p className="mt-1 text-sm text-text-secondary">
                    Review and manage your recent measurements.
                </p>
                <div className="mt-4"><ListSkeleton /></div>
            </section>
        </SkeletonRegion>
    );
}
