"use client";

import {
    Activity,
    Plus,
    Settings2,
    Trash2,
} from "lucide-react";

import { Button } from "@/components/ui";

import { formatDateDisplay } from "@/lib/utils/date";

import type { HealthLog } from "../types/health";

import {
    getHealthLogSummary,
} from "../utils/health-formatters";

import {
    getTodayDateKey,
} from "../utils/health-calculations";

interface RecentHealthLogsProps {
    logs: HealthLog[];
    onAdd: () => void;
    onEdit: (log: HealthLog) => void;
    onDelete: (log: HealthLog) => void;
}

export function RecentHealthLogs({
    logs,
    onAdd,
    onEdit,
    onDelete,
}: RecentHealthLogsProps) {
    return (
        <section
            className="min-w-0 rounded-xl border border-border bg-surface p-4 sm:p-5"
            aria-labelledby="health-recent-logs-title"
        >
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                    <h2
                        id="health-recent-logs-title"
                        className="text-sm font-semibold text-text-primary"
                    >
                        Recent health logs
                    </h2>

                    <p className="mt-1 text-xs text-text-secondary">
                        Review and manage your recent measurements.
                    </p>
                </div>

                <Button
                    variant="outline"
                    onClick={onAdd}
                >
                    <Plus
                        className="mr-2 size-4"
                        aria-hidden="true"
                    />
                    Add log
                </Button>
            </div>

            {logs.length === 0 ? (
                <div className="mt-5 flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-5 py-10 text-center">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-surface-elevated">
                        <Activity
                            className="size-5 text-text-secondary"
                            aria-hidden="true"
                        />
                    </div>

                    <p className="mt-3 text-sm font-medium text-text-primary">
                        No health logs yet
                    </p>

                    <p className="mt-1 max-w-sm text-sm text-text-secondary">
                        Start recording your daily measurements to
                        see your health history here.
                    </p>

                    <Button
                        className="mt-4"
                        onClick={onAdd}
                    >
                        <Plus
                            className="mr-2 size-4"
                            aria-hidden="true"
                        />
                        Create your first log
                    </Button>
                </div>
            ) : (
                <div className="mt-4 divide-y divide-border-subtle">
                    {logs.map((log) => {
                        const summary = getHealthLogSummary(log);

                        return (
                            <article
                                key={log.id}
                                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 py-3 md:flex md:gap-3 md:py-4 md:items-start md:justify-between"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="text-sm font-semibold text-text-primary">
                                            {formatDateDisplay(log.date)}
                                        </h3>

                                        {log.date === getTodayDateKey() && (
                                            <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs font-medium text-text-secondary">
                                                Today
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-1 text-xs leading-5 text-text-secondary md:hidden">
                                        <p>{summary.slice(0, 2).join(" / ") || "No measurements recorded"}</p>
                                        {summary.length > 2 && (
                                            <details className="mt-1">
                                                <summary className="min-h-11 cursor-pointer py-3 font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                                                    All {summary.length} measurements
                                                </summary>
                                                <ul className="grid grid-cols-2 gap-x-3 gap-y-1 pb-2">
                                                    {summary.map((item) => (
                                                        <li key={item}>{item}</li>
                                                    ))}
                                                </ul>
                                            </details>
                                        )}
                                    </div>
                                    <div className="mt-2 hidden flex-wrap gap-2 md:flex">
                                        {summary.map((item) => (
                                            <span
                                                key={item}
                                                className="rounded-md bg-surface-elevated px-2 py-1 text-xs text-text-secondary"
                                            >
                                                {item}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex shrink-0 flex-col items-end gap-0 md:flex-row md:items-center md:gap-3 md:pt-0.5">
                                    <button
                                        type="button"
                                        onClick={() => onEdit(log)}
                                        aria-label={`Edit health log for ${formatDateDisplay(log.date)}`}
                                        className="inline-flex items-center gap-1.5 rounded-md min-h-11 px-3 py-2 sm:min-h-0 sm:px-2 sm:py-1 text-xs font-medium text-primary transition-colors hover:bg-surface-hover"
                                    >
                                        <Settings2
                                            className="size-3.5"
                                            aria-hidden="true"
                                        />
                                        Edit
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => onDelete(log)}
                                        aria-label={`Delete health log for ${formatDateDisplay(log.date)}`}
                                        className="inline-flex items-center gap-1.5 rounded-md min-h-11 px-3 py-2 sm:min-h-0 sm:px-2 sm:py-1 text-xs font-medium text-danger transition-colors hover:bg-danger-subtle"
                                    >
                                        <Trash2
                                            className="size-3.5"
                                            aria-hidden="true"
                                        />
                                        Delete
                                    </button>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
        </section>
    );
}