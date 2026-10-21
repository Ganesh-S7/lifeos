import { ListSkeleton, Skeleton, SkeletonRegion, StatCardsSkeleton } from "@/components/ui";

export function ExpensesSkeleton() {
    return (
        <SkeletonRegion label="Loading your expenses" className="space-y-6">
            <StatCardsSkeleton />
            <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-surface p-4">
                <Skeleton className="h-10 min-w-40 flex-1" />
                <Skeleton className="h-10 w-36" />
                <Skeleton className="h-10 w-36" />
                <Skeleton className="h-10 w-36" />
            </div>
            <Skeleton variant="text" className="w-40" />
            <div className="rounded-xl border border-border bg-surface px-5">
                <div className="hidden justify-between gap-4 border-b border-border py-4 md:flex">
                    {Array.from({ length: 5 }, (_, index) => (
                        <Skeleton key={index} variant="text" className="w-20" />
                    ))}
                </div>
                <ListSkeleton rows={6} />
            </div>
        </SkeletonRegion>
    );
}
