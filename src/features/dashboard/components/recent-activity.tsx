import { MoreHorizontal } from "lucide-react";
import { Card, IconButton } from "@/components/ui";
import {
    activityIcons,
    recentActivity,
} from "../data/mock-data";

export function RecentActivity() {
    return (
        <Card>
            <div className="flex items-center justify-between border-b border-border-subtle p-5">
                <div>
                    <p className="text-sm font-semibold text-text-primary">
                        Recent activity
                    </p>

                    <p className="mt-1 text-xs text-text-secondary">
                        Latest updates across LifeOS
                    </p>
                </div>

                <IconButton size="sm" aria-label="More options">
                    <MoreHorizontal className="size-4" />
                </IconButton>
            </div>

            <div className="divide-y divide-border-subtle">
                {recentActivity.map((item) => {
                    const Icon = activityIcons[item.type];

                    return (
                        <div
                            key={`${item.title}-${item.time}`}
                            className="flex items-center gap-3 px-5 py-4"
                        >
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-elevated text-text-secondary">
                                <Icon className="size-4" />
                            </div>

                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium text-text-primary">
                                    {item.title}
                                </p>

                                <p className="mt-0.5 truncate text-[11px] text-text-muted">
                                    {item.description}
                                </p>
                            </div>

                            <span className="shrink-0 text-[10px] text-text-muted">
                                {item.time}
                            </span>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}