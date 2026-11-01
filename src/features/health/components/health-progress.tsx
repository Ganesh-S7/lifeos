"use client";

import {
    Activity,
    ChevronLeft,
    ChevronRight,
    Settings2,
} from "lucide-react";

import { Button } from "@/components/ui";

import {
    formatDateDisplay,
    formatDateValue,
    parseDateValue,
} from "@/lib/utils/date";


import {
    formatProgressValue,
} from "../utils/health-formatters";
import { HealthProgressMetric } from "../types/health";

interface HealthProgressProps {
    metrics: HealthProgressMetric[];
    selectedDate: string;
    todayDate: string;
    onSelectedDateChange: (date: string) => void;
    onManageTargets: () => void;
}

interface ProgressItemProps {
    metric: HealthProgressMetric;
}

function ProgressItem({ metric }: ProgressItemProps) {

    const hasValue = typeof metric.value === "number";

    const valueLabel =
        typeof metric.value === "number"
            ? formatProgressValue(metric.value, metric.key)
            : "Not recorded";

    const targetLabel = formatProgressValue(
        metric.target,
        metric.key,
    );

    const percentage = metric.percentage ?? 0;

    return (
        <div className="min-w-0 space-y-2">
            <div className="flex flex-col items-start gap-1 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-2">
                <span className="text-sm font-medium text-text-primary">
                    {metric.label}
                </span>

                <span className="text-xs text-text-secondary">
                    {hasValue
                        ? `${valueLabel} / ${targetLabel}`
                        : `Target: ${targetLabel}`}
                </span>
            </div>

            <div
                role="progressbar"
                aria-label={`${metric.label} progress`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percentage}
                aria-valuetext={
                    hasValue
                        ? `${percentage}% of target`
                        : "Not recorded for this day"
                }
                className="h-2 overflow-hidden rounded-full bg-surface-elevated"
            >
                <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{
                        width: `${percentage}%`,
                        backgroundColor: "var(--brand)",
                    }}
                />
            </div>

            <p className="text-xs text-text-muted">
                {hasValue
                    ? `${percentage}% completed`
                    : "No measurement recorded for this day"}
            </p>
        </div>
    );
}

function shiftDate(dateKey: string, days: number): string {
    const date = parseDateValue(dateKey);

    date.setDate(date.getDate() + days);

    return formatDateValue(date);
}

export function HealthProgress({
    metrics,
    selectedDate,
    todayDate,
    onSelectedDateChange,
    onManageTargets,
}: HealthProgressProps) {
    const isToday = selectedDate === todayDate;
    const isFutureDate = selectedDate > todayDate;

    const displayDate = isToday
        ? "Today"
        : formatDateDisplay(selectedDate);

    function navigateDay(direction: -1 | 1) {
        const nextDate = shiftDate(selectedDate, direction);

        // Prevent navigating into future dates.
        if (nextDate > todayDate) {
            return;
        }

        onSelectedDateChange(nextDate);
    }

    return (
        <section
            className="min-w-0 rounded-xl border border-border bg-surface p-4 sm:p-5"
            aria-labelledby="health-progress-title"
        >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 md:flex md:items-center md:justify-between md:gap-4">
                {/* Date navigation */}
                <div className="contents md:block">
                    <h2
                        id="health-progress-title"
                        className="text-sm font-semibold text-text-primary"
                    >
                        {isToday ? "Today's progress" : "Daily progress"}
                    </h2>

                    <div className="col-span-2 row-start-2 mt-1 flex min-w-0 items-center gap-1 md:mt-2 md:gap-2">
                        <button
                            type="button"
                            aria-label="View previous day"
                            onClick={() => navigateDay(-1)}
                            className="group inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:size-8 md:border md:border-border md:hover:bg-surface-hover"
                        >
                            <span className="inline-flex size-7 items-center justify-center rounded-md border border-border group-hover:bg-surface-hover md:contents">
                                <ChevronLeft
                                    className="size-3.5 md:size-4"
                                    aria-hidden="true"
                                />
                            </span>
                        </button>

                        <span
                            aria-live="polite"
                            className="min-w-0 flex-1 whitespace-nowrap text-center text-xs font-medium text-text-primary md:min-w-28 md:flex-none md:text-sm"
                        >
                            {displayDate}
                        </span>

                        <button
                            type="button"
                            aria-label="View next day"
                            onClick={() => navigateDay(1)}
                            disabled={isToday || isFutureDate}
                            className="group inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40 md:size-8 md:border md:border-border md:hover:bg-surface-hover"
                        >
                            <span className="inline-flex size-7 items-center justify-center rounded-md border border-border group-hover:bg-surface-hover md:contents">
                                <ChevronRight
                                    className="size-3.5 md:size-4"
                                    aria-hidden="true"
                                />
                            </span>
                        </button>

                        {!isToday && (
                            <button
                                type="button"
                                onClick={() =>
                                    onSelectedDateChange(todayDate)
                                }
                                className="ml-1 min-h-11 shrink-0 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-surface-hover md:min-h-0"
                            >
                                Today
                            </button>
                        )}
                    </div>

                    <p className="col-span-2 mt-1 text-xs text-text-secondary">
                        {formatDateDisplay(selectedDate)}
                    </p>
                </div>

                <Button
                    variant="outline"
                    className="col-start-2 row-start-1 max-md:h-11 max-md:gap-1.5 max-md:border-transparent max-md:px-2 max-md:text-xs"
                    onClick={onManageTargets}
                >
                    <Settings2
                        className="size-3.5 md:mr-2 md:size-4"
                        aria-hidden="true"
                    />
                    Edit targets
                </Button>
            </div>

            {/* Progress metrics */}
            {metrics.length > 0 ? (
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 md:mt-6 md:gap-x-8 md:gap-y-6">
                    {metrics.map((metric) => (
                        <ProgressItem
                            key={metric.key}
                            metric={metric}
                        />
                    ))}
                </div>
            ) : (
                <div className="mt-5 rounded-xl border border-dashed border-border px-5 py-8 text-center">
                    <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-surface-elevated">
                        <Activity
                            className="size-5 text-text-secondary"
                            aria-hidden="true"
                        />
                    </div>

                    <p className="mt-3 text-sm font-medium text-text-primary">
                        No daily targets configured
                    </p>

                    <p className="mx-auto mt-1 max-w-md text-sm text-text-secondary">
                        Configure targets for steps, sleep, water,
                        or nutrition to track your daily progress.
                    </p>

                    <Button
                        className="mt-4"
                        onClick={onManageTargets}
                    >
                        Set your targets
                    </Button>
                </div>
            )}
        </section>
    );
}
