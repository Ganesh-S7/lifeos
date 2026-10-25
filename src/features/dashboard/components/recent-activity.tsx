"use client";

import Link from "next/link";
import { HeartPulse } from "lucide-react";
import { Card, LoadError, Skeleton, SkeletonRegion } from "@/components/ui";
import { getRecentHealthLogs } from "@/features/health/utils/health-calculations";
import { getHealthLogSummary } from "@/features/health/utils/health-formatters";
import { formatDateDisplay } from "@/lib/utils/date";
import { useDashboardHealth } from "../hooks/use-dashboard-health";

export function RecentActivity() {
    const { ready, failed, logs, retry } = useDashboardHealth();
    const recentLogs = getRecentHealthLogs(logs, 5);

    return (
        <Card>
            <div className="flex items-center justify-between border-b border-border-subtle p-5">
                <div>
                    <p className="text-sm font-semibold text-text-primary">Recent activity</p>
                    <p className="mt-1 text-xs text-text-secondary">Your latest recorded health logs</p>
                </div>
                <Link href="/health" className="text-xs font-medium text-primary hover:underline">
                    View Health
                </Link>
            </div>

            {!ready ? (
                failed ? (
                    <LoadError message="Unable to load your health data. Please try again." onRetry={retry} />
                ) : (
                    <SkeletonRegion label="Loading recent health activity" className="space-y-4 p-5">
                        {[0, 1, 2].map((index) => (
                            <div key={index} className="space-y-2">
                                <Skeleton variant="text" className="w-40" />
                                <Skeleton variant="text" className="w-56" />
                            </div>
                        ))}
                    </SkeletonRegion>
                )
            ) : recentLogs.length === 0 ? (
                <p className="p-5 text-sm text-text-secondary">
                    No health activity recorded yet. Add your first log in Health to get started.
                </p>
            ) : (
                <div className="divide-y divide-border-subtle">
                    {recentLogs.map((log) => (
                        <div key={log.id} className="flex items-center gap-3 px-5 py-4">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-elevated text-text-secondary">
                                <HeartPulse className="size-4" aria-hidden="true" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium text-text-primary">Health log recorded</p>
                                <p className="mt-0.5 truncate text-[11px] text-text-muted">
                                    {getHealthLogSummary(log).join(" / ")}
                                </p>
                            </div>
                            <time dateTime={log.date} className="shrink-0 text-[10px] text-text-muted">
                                {formatDateDisplay(log.date)}
                            </time>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}
