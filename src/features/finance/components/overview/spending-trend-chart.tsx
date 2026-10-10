"use client";

import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

import type { SpendingTrendPoint } from "@/features/finance/data/mock-finance-overview";
import { formatCurrency } from "@/lib/utils/currency";

interface SpendingTrendChartProps {
    data: SpendingTrendPoint[];
}

export function SpendingTrendChart({
    data,
}: SpendingTrendChartProps) {
    return (
        <section className="rounded-2xl border border-border bg-surface p-5">
            <div className="mb-5">
                <h2 className="text-base font-semibold text-text-primary">
                    Spending trend
                </h2>

                <p className="mt-1 text-sm text-text-secondary">
                    Your monthly spending over the last six months
                </p>
            </div>

            <div className="h-65 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                        data={data}
                        margin={{
                            top: 8,
                            right: 8,
                            left: -16,
                            bottom: 0,
                        }}
                    >
                        <defs>
                            <linearGradient
                                id="spendingTrendGradient"
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
                                    offset="95%"
                                    stopColor="var(--brand)"
                                    stopOpacity={0}
                                />
                            </linearGradient>
                        </defs>

                        <CartesianGrid
                            vertical={false}
                            stroke="var(--border)"
                            strokeDasharray="4 4"
                        />

                        <XAxis
                            dataKey="month"
                            axisLine={false}
                            tickLine={false}
                            tickMargin={10}
                            tick={{
                                fill: "var(--text-muted)",
                                fontSize: 12,
                            }}
                        />

                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tickMargin={8}
                            tick={{
                                fill: "var(--text-muted)",
                                fontSize: 11,
                            }}
                            tickFormatter={(value) => {
                                const amount = Number(value);

                                return amount >= 1000
                                    ? `₹${Math.round(amount / 1000)}k`
                                    : `₹${amount}`;
                            }}
                        />

                        <Tooltip
                            formatter={(value) =>
                                formatCurrency(Number(value ?? 0))
                            }
                            contentStyle={{
                                backgroundColor: "var(--surface-elevated)",
                                border: "1px solid var(--border)",
                                borderRadius: "12px",
                                color: "var(--text-primary)",
                                fontSize: 12,
                                boxShadow: "none",
                            }}
                            labelStyle={{
                                color: "var(--text-secondary)",
                                marginBottom: 4,
                            }}
                        />

                        <Area
                            type="monotone"
                            dataKey="amount"
                            name="Spending"
                            stroke="var(--brand)"
                            strokeWidth={2.5}
                            fill="url(#spendingTrendGradient)"
                            activeDot={{
                                r: 5,
                                fill: "var(--brand)",
                                stroke: "var(--surface)",
                                strokeWidth: 2,
                            }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            <p className="mt-3 text-xs text-text-muted">
                Older months use illustrative sample data. Recent months use
                the seeded expense records.
            </p>
        </section>
    );
}