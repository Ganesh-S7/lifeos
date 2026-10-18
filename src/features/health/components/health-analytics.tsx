"use client";

import { useMemo, useState } from "react";
import { Activity } from "lucide-react";
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { formatDateDisplay, parseDateValue } from "@/lib/utils/date";
import type {
    HealthAnalyticsPoint,
    HealthLog,
} from "../types/health";
import { getHealthAnalyticsTrend } from "../utils/health-calculations";
import {
    formatHealthInteger,
    formatHealthNumber,
} from "../utils/health-formatters";
import { Select } from "@/components/ui";

type AnalyticsMetricKey =
    | "weightKg"
    | "steps"
    | "sleepHours"
    | "waterLitres"
    | "caloriesKcal"
    | "proteinGrams"
    | "carbsGrams"
    | "fiberGrams";

type TrendRange = 7 | 15 | 30 | 60 | 90;

interface AnalyticsMetric {
    key: AnalyticsMetricKey;
    label: string;
    unit: string;
    description: string;
}

const analyticsMetrics: AnalyticsMetric[] = [
    {
        key: "weightKg",
        label: "Weight",
        unit: "kg",
        description: "Body weight trend",
    },
    {
        key: "steps",
        label: "Steps",
        unit: "steps",
        description: "Daily step count",
    },
    {
        key: "sleepHours",
        label: "Sleep",
        unit: "h",
        description: "Daily sleep duration",
    },
    {
        key: "waterLitres",
        label: "Water",
        unit: "L",
        description: "Daily water intake",
    },
    {
        key: "caloriesKcal",
        label: "Calories",
        unit: "kcal",
        description: "Daily calorie intake",
    },
    {
        key: "proteinGrams",
        label: "Protein",
        unit: "g",
        description: "Daily protein intake",
    },
    {
        key: "carbsGrams",
        label: "Carbs",
        unit: "g",
        description: "Daily carbohydrate intake",
    },
    {
        key: "fiberGrams",
        label: "Fiber",
        unit: "g",
        description: "Daily fiber intake",
    },
];

const trendRanges: {
    value: TrendRange;
    label: string;
}[] = [
        {
            value: 7,
            label: "1 Week",
        },
        {
            value: 15,
            label: "15 Days",
        },
        {
            value: 30,
            label: "30 Days",
        },
        {
            value: 60,
            label: "60 Days",
        },
        {
            value: 90,
            label: "90 Days",
        },
    ];

function getMetricValue(
    point: HealthAnalyticsPoint,
    key: AnalyticsMetricKey,
): number | undefined {
    return point[key];
}

function formatMetricValue(
    value: number,
    metric: AnalyticsMetric,
): string {
    switch (metric.key) {
        case "steps":
        case "caloriesKcal":
            return `${formatHealthInteger(value)} ${metric.unit}`;

        case "weightKg":
        case "sleepHours":
        case "waterLitres":
        case "proteinGrams":
        case "carbsGrams":
        case "fiberGrams":
            return `${formatHealthNumber(value)} ${metric.unit}`;

        default:
            return String(value);
    }
}

/**
 * Returns a rounded, readable tick interval for the requested range.
 * Examples include 0.5, 1, 2, 5, 10, 500 and 1,000.
 */
function getNiceAxisStep(range: number): number {
    const safeRange = Math.max(range, Number.EPSILON);

    const exponent = Math.floor(Math.log10(safeRange));
    const fraction = safeRange / 10 ** exponent;

    let niceFraction: number;

    if (fraction <= 1) {
        niceFraction = 1;
    } else if (fraction <= 2) {
        niceFraction = 2;
    } else if (fraction <= 5) {
        niceFraction = 5;
    } else {
        niceFraction = 10;
    }

    return niceFraction * 10 ** exponent;
}

/**
 * Calculates a dynamic Y-axis domain from the selected metric's
 * actual measurements.
 *
 * The axis includes a little breathing room around the data,
 * uses rounded boundaries, and never goes below zero.
 */
function getNiceYAxisDomain(
    values: number[],
): [number, number] {
    if (values.length === 0) {
        return [0, 1];
    }

    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);

    const dataRange = dataMax - dataMin;

    // Handle identical measurements without producing a flat axis.
    const padding =
        dataRange === 0
            ? Math.max(Math.abs(dataMax) * 0.01, 0.1)
            : dataRange * 0.15;

    const paddedMin = Math.max(0, dataMin - padding);
    const paddedMax = dataMax + padding;

    // Target approximately four intervals with rounded tick values.
    const step = getNiceAxisStep(
        (paddedMax - paddedMin) / 4,
    );

    const domainMin = Math.max(
        0,
        Math.floor(paddedMin / step) * step,
    );

    let domainMax =
        Math.ceil(paddedMax / step) * step;

    if (domainMax <= domainMin) {
        domainMax = domainMin + step;
    }

    // Avoid floating-point artifacts in the final domain.
    const precision = Math.min(
        10,
        Math.max(0, -Math.floor(Math.log10(step))),
    );

    return [
        Number(domainMin.toFixed(precision)),
        Number(domainMax.toFixed(precision)),
    ];
}

interface HealthAnalyticsProps {
    logs: HealthLog[];
}

export function HealthAnalytics({
    logs,
}: HealthAnalyticsProps) {
    // `null` means automatic selection: use the first metric with data.
    // Once the user picks a metric, keep that explicit selection.
    const [selectedMetricKey, setSelectedMetricKey] =
        useState<AnalyticsMetricKey | null>(null);

    const [trendDays, setTrendDays] =
        useState<TrendRange>(30);

    const trendData = useMemo(
        () => getHealthAnalyticsTrend(logs, new Date(), trendDays),
        [logs, trendDays],
    );

    const availableMetricKeys = useMemo(
        () =>
            analyticsMetrics
                .filter((metric) =>
                    trendData.some((point) => {
                        const value = getMetricValue(point, metric.key);

                        return (
                            typeof value === "number" &&
                            Number.isFinite(value)
                        );
                    }),
                )
                .map((metric) => metric.key),
        [trendData],
    );

    // Derive the default from the available data instead of setting state
    // inside an effect. This also works when database logs load asynchronously.
    const activeMetricKey =
        selectedMetricKey ?? availableMetricKeys[0] ?? "weightKg";

    const activeMetric =
        analyticsMetrics.find(
            (metric) => metric.key === activeMetricKey,
        ) ?? analyticsMetrics[0];

    // Include only dates where the selected metric has a recorded value.
    const chartData = trendData.filter((point) => {
        const value = getMetricValue(
            point,
            activeMetric.key,
        );

        return (
            typeof value === "number" &&
            Number.isFinite(value)
        );
    });

    const hasEnoughData = chartData.length >= 2;

    const hasAnyData = chartData.length > 0;

    const rangeDescription =
        trendDays === 7
            ? "the last week"
            : `the last ${trendDays} days`;

    // Derive the axis scale from the currently selected metric.
    const yAxisValues = chartData
        .map((point) =>
            getMetricValue(point, activeMetric.key),
        )
        .filter(
            (value): value is number =>
                typeof value === "number" &&
                Number.isFinite(value),
        );

    const yAxisDomain = getNiceYAxisDomain(yAxisValues);

    return (
        <section
            className="rounded-2xl border border-border bg-surface p-5"
            aria-labelledby="health-analytics-title"
        >
            {/* Header and trend range */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2
                        id="health-analytics-title"
                        className="text-base font-semibold text-text-primary"
                    >
                        Health analytics
                    </h2>

                    <p className="mt-1 text-sm text-text-secondary">
                        Explore your daily measurements over{" "}
                        {rangeDescription}.
                    </p>
                </div>

                <div className="w-full sm:w-44">
                    <Select
                        label="Trend range"
                        options={trendRanges.map((range) => ({
                            label: range.label,
                            value: String(range.value),
                        }))}
                        value={String(trendDays)}
                        onChange={(value) => {
                            if (!value) {
                                return;
                            }

                            setTrendDays(
                                Number(value) as TrendRange,
                            );
                        }}
                    />
                </div>
            </div>

            {/* Metric selector */}
            <div
                role="group"
                aria-label="Select a health metric"
                className="flex flex-wrap gap-2"
            >
                {analyticsMetrics.map((metric) => {
                    const isActive =
                        metric.key === activeMetricKey;

                    return (
                        <button
                            key={metric.key}
                            type="button"
                            aria-pressed={isActive}
                            onClick={() =>
                                setSelectedMetricKey(metric.key)
                            }
                            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${isActive
                                    ? "border-primary bg-surface-elevated text-text-primary"
                                    : "border-border text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
                                }`}
                            style={
                                isActive
                                    ? {
                                        borderColor: "var(--brand)",
                                    }
                                    : undefined
                            }
                        >
                            {metric.label}
                        </button>
                    );
                })}
            </div>

            {/* Chart */}
            <div className="mt-5">
                <h3 className="text-sm font-medium text-text-primary">
                    {activeMetric.description}
                </h3>

                {hasAnyData && !hasEnoughData && (
                    <p className="mt-2 text-xs text-text-secondary">
                        One measurement is available for this period. Record another
                        measurement on a different day to see how it changes over time.
                    </p>
                )}

                {hasAnyData ? (
                    <div className="mt-4 h-72 w-full">
                        <ResponsiveContainer
                            width="100%"
                            height="100%"
                        >
                            <AreaChart
                                data={chartData}
                                margin={{
                                    top: 10,
                                    right: 12,
                                    left: 0,
                                    bottom: 0,
                                }}
                            >
                                <defs>
                                    <linearGradient
                                        id="healthAnalyticsGradient"
                                        x1="0"
                                        y1="0"
                                        x2="0"
                                        y2="1"
                                    >
                                        <stop
                                            offset="0%"
                                            stopColor="var(--brand)"
                                            stopOpacity={0.25}
                                        />

                                        <stop
                                            offset="100%"
                                            stopColor="var(--brand)"
                                            stopOpacity={0.02}
                                        />
                                    </linearGradient>
                                </defs>

                                <CartesianGrid
                                    vertical={false}
                                    stroke="var(--border)"
                                    strokeDasharray="4 4"
                                />

                                <XAxis
                                    dataKey="date"
                                    ticks={chartData.map(
                                        (point) => point.date,
                                    )}
                                    axisLine={false}
                                    tickLine={false}
                                    minTickGap={28}
                                    tick={{
                                        fontSize: 11,
                                        fill: "var(--text-secondary)",
                                    }}
                                    tickFormatter={(value: string) => {
                                        const date =
                                            parseDateValue(value);

                                        return date.toLocaleDateString(
                                            "en-IN",
                                            {
                                                day: "numeric",
                                                month: "short",
                                            },
                                        );
                                    }}
                                />

                                <YAxis
                                    domain={yAxisDomain}
                                    tickCount={5}
                                    axisLine={false}
                                    tickLine={false}
                                    width={100}
                                    tick={{
                                        fontSize: 11,
                                        fill: "var(--text-secondary)",
                                    }}
                                    tickFormatter={(value: number) =>
                                        formatMetricValue(
                                            value,
                                            activeMetric,
                                        )
                                    }
                                />

                                <Tooltip
                                    labelFormatter={(value) =>
                                        formatDateDisplay(
                                            String(value),
                                        )
                                    }
                                    formatter={(value) => [
                                        formatMetricValue(
                                            Number(value),
                                            activeMetric,
                                        ),
                                        activeMetric.label,
                                    ]}
                                    contentStyle={{
                                        backgroundColor: "var(--surface)",
                                        border: "1px solid var(--border)",
                                        borderRadius: 12,
                                        color: "var(--text-primary)",
                                        fontSize: 12,
                                    }}
                                />

                                <Area
                                    type="monotone"
                                    dataKey={activeMetric.key}
                                    name={activeMetric.label}
                                    stroke="var(--brand)"
                                    strokeWidth={2}
                                    fill="url(#healthAnalyticsGradient)"
                                    baseValue={yAxisDomain[0]}
                                    connectNulls={false}
                                    dot={{
                                        r: 3,
                                        fill: "var(--brand)",
                                        strokeWidth: 0,
                                    }}
                                    activeDot={{
                                        r: 5,
                                        fill: "var(--brand)",
                                    }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="mt-4 flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-border p-6 text-center">
                        <div className="flex size-11 items-center justify-center rounded-xl bg-surface-elevated">
                            <Activity
                                className="size-5 text-text-secondary"
                                aria-hidden="true"
                            />
                        </div>

                        <p className="mt-3 text-sm font-medium text-text-primary">
                            No {activeMetric.label.toLowerCase()} data in this period
                        </p>

                        <p className="mt-1 max-w-sm text-sm text-text-secondary">
                            Record {activeMetric.label.toLowerCase()} in your daily health logs during this period to see its trend here.
                        </p>
                    </div>
                )}
            </div>
        </section>
    );
}