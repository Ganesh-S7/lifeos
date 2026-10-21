"use client";

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

import {
    formatDateDisplay,
    parseDateValue,
} from "@/lib/utils/date";

import {
    formatHealthNumber,
} from "../utils/health-formatters";

export interface WeightTrendPoint {
    date: string;
    weightKg: number;
}

interface WeightTrendChartProps {
    data: WeightTrendPoint[];
}

export function WeightTrendChart({
    data,
}: WeightTrendChartProps) {
    return (
        <section
            className="rounded-2xl border border-border bg-surface p-5"
            aria-labelledby="health-weight-trend-title"
        >
            <div>
                <h2
                    id="health-weight-trend-title"
                    className="text-base font-semibold text-text-primary"
                >
                    Weight trend
                </h2>

                <p className="mt-1 text-sm text-text-secondary">
                    Your recorded weight over the last 30 calendar days.
                </p>
            </div>

            {data.length === 0 ? (
                <div className="mt-5 flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-border p-6 text-center">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-surface-elevated">
                        <Activity
                            className="size-5 text-text-secondary"
                            aria-hidden="true"
                        />
                    </div>

                    <p className="mt-3 text-sm font-medium text-text-primary">
                        No weight measurements yet
                    </p>

                    <p className="mt-1 max-w-sm text-sm text-text-secondary">
                        Record your weight in a health log to start
                        building your trend.
                    </p>
                </div>
            ) : (
                <div className="mt-5 h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={data}
                            margin={{
                                top: 10,
                                right: 12,
                                left: -18,
                                bottom: 0,
                            }}
                        >
                            <defs>
                                <linearGradient
                                    id="healthWeightGradient"
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
                                axisLine={false}
                                tickLine={false}
                                minTickGap={28}
                                tick={{
                                    fontSize: 11,
                                    fill: "var(--text-secondary)",
                                }}
                                tickFormatter={(value: string) => {
                                    const date = parseDateValue(value);

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
                                domain={["auto", "auto"]}
                                axisLine={false}
                                tickLine={false}
                                width={54}
                                tick={{
                                    fontSize: 11,
                                    fill: "var(--text-secondary)",
                                }}
                                tickFormatter={(value: number) =>
                                    `${value} kg`
                                }
                            />

                            <Tooltip
                                labelFormatter={(value) =>
                                    formatDateDisplay(String(value))
                                }
                                formatter={(value) => [
                                    `${formatHealthNumber(Number(value))} kg`,
                                    "Weight",
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
                                dataKey="weightKg"
                                name="Weight"
                                stroke="var(--brand)"
                                strokeWidth={2}
                                fill="url(#healthWeightGradient)"
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
            )}
        </section>
    );
}