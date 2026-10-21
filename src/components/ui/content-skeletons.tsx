import { Card } from "./card";
import { Skeleton } from "./skeleton";
import { cn } from "@/lib/utils/cn";

export function StatCardsSkeleton({
    className,
    actions = false,
}: {
    className?: string;
    actions?: boolean;
}) {
    return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
                <Card key={index} className={cn("space-y-3 p-5", className)}>
                    <div className="flex justify-between gap-4">
                        <div className="flex-1 space-y-3">
                            <Skeleton variant="text" className="w-24 max-w-full" />
                            <Skeleton className="h-7 w-32 max-w-full" />
                        </div>
                        <Skeleton className="size-9 shrink-0" />
                    </div>
                    <Skeleton variant="text" className="w-4/5" />
                    {actions && (
                        <div className="border-t border-border-subtle pt-4">
                            <Skeleton variant="text" className="w-24" />
                        </div>
                    )}
                </Card>
            ))}
        </div>
    );
}

export function ChartSkeleton({ className }: { className?: string; }) {
    return (
        <div className={cn("flex h-64 items-end gap-3 border-b border-l border-border-subtle p-4", className)}>
            {[40, 65, 50, 80, 60, 90].map((height, index) => (
                <Skeleton
                    key={index}
                    className="min-w-0 flex-1 rounded-b-none"
                    style={{ height: `${height}%` }}
                />
            ))}
        </div>
    );
}

export function ListSkeleton({ rows = 5 }: { rows?: number; }) {
    return (
        <div className="divide-y divide-border-subtle">
            {Array.from({ length: rows }, (_, index) => (
                <div key={index} className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton variant="text" className="w-40 max-w-full" />
                        <Skeleton variant="text" className="w-28 max-w-full" />
                    </div>
                    <Skeleton className="h-4 w-20 shrink-0" />
                </div>
            ))}
        </div>
    );
}
