"use client";

import {
    Activity,
    Settings2,
} from "lucide-react";

import { Button } from "@/components/ui";

import type {
    HealthProgressMetric,
} from "../utils/health-calculations";

import {
    formatProgressValue,
} from "../utils/health-formatters";

interface HealthProgressProps {
    metrics: HealthProgressMetric[];
    dateLabel: string;
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
                        : "Not recorded today"
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
                    : "Log today's measurement to track progress"}
            </p>
        </div>
    );
}

export function HealthProgress({
    metrics,
    dateLabel,
    onManageTargets,
}: HealthProgressProps) {
    return (
        <section
            className="rounded-2xl border border-border bg-surface p-5"
            aria-labelledby="health-progress-title"
        >
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                    <h2
                        id="health-progress-title"
                        className="text-base font-semibold text-text-primary"
                    >
                        Today&apos;s progress
                    </h2>

                    <p className="mt-1 text-sm text-text-secondary">
                        {dateLabel}
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
                        Set targets for steps, sleep, water, or nutrition
                        to track your daily progress. You can choose only
                        the metrics that matter to you.
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