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
        <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
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
            className="rounded-2xl border border-border bg-surface p-5"
            aria-labelledby="health-progress-title"
        >
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                {/* Date navigation */}
                <div>
                    <h2
                        id="health-progress-title"
                        className="text-base font-semibold text-text-primary"
                    >
                        {isToday ? "Today's progress" : "Daily progress"}
                    </h2>

                    <div className="mt-2 flex items-center gap-2">
                        <button
                            type="button"
                            aria-label="View previous day"
                            onClick={() => navigateDay(-1)}
                            className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
                        >
                            <ChevronLeft
                                className="size-4"
                                aria-hidden="true"
                            />
                        </button>

                        <span
                            aria-live="polite"
                            className="min-w-28 text-center text-sm font-medium text-text-primary"
                        >
                            {displayDate}
                        </span>

                        <button
                            type="button"
                            aria-label="View next day"
                            onClick={() => navigateDay(1)}
                            disabled={isToday || isFutureDate}
                            className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <ChevronRight
                                className="size-4"
                                aria-hidden="true"
                            />
                        </button>

                        {!isToday && (
                            <button
                                type="button"
                                onClick={() =>
                                    onSelectedDateChange(todayDate)
                                }
                                className="ml-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-surface-elevated"
                            >
                                Today
                            </button>
                        )}
                    </div>

                    <p className="mt-1 text-xs text-text-secondary">
                        {formatDateDisplay(selectedDate)}
                    </p>
                </div>

                <Button
                    variant="outline"
                    onClick={onManageTargets}
                >
                    <Settings2
                        className="mr-2 size-4"
                        aria-hidden="true"
                    />
                    Edit targets
                </Button>
            </div>

            {/* Progress metrics */}
            {metrics.length > 0 ? (
                <div className="mt-6 grid gap-x-8 gap-y-6 md:grid-cols-2">
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