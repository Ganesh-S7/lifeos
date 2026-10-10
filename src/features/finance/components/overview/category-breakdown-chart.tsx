"use client";

import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

import type { CategorySpendingPoint } from "@/features/finance/data/mock-finance-overview";
import { formatCurrency } from "@/lib/utils/currency";

interface CategoryBreakdownChartProps {
    data: CategorySpendingPoint[];
}

export function CategoryBreakdownChart({
    data,
}: CategoryBreakdownChartProps) {
    return (
        <section className="rounded-2xl h-full border border-border bg-surface p-5">
            <div className="mb-5">
                <h2 className="text-base font-semibold text-text-primary">
                    Spending by category
                </h2>

                <p className="mt-1 text-sm text-text-secondary">
                    Where your money goes this month
                </p>
            </div>

            {data.length === 0 ? (
                <div className="flex h-65 items-center justify-center">
                    <p className="text-sm text-text-muted">
                        No expenses recorded this month yet.
                    </p>
                </div>
            ) : (
                <div
                    className="w-full"
                    style={{ height: Math.max(260, data.length * 42) }}
                >
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={data}
                            layout="vertical"
                            margin={{
                                top: 0,
                                right: 8,
                                bottom: 0,
                                left: 0,
                            }}
                        >
                            <CartesianGrid
                                horizontal={false}
                                stroke="var(--border)"
                                strokeDasharray="4 4"
                            />

                            <XAxis
                                type="number"
                                hide
                            />

                            <YAxis
                                type="category"
                                dataKey="category"
                                width={105}
                                interval={0}
                                axisLine={false}
                                tickLine={false}
                                tick={{
                                    fill: "var(--text-secondary)",
                                    fontSize: 12,
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
                                cursor={{
                                    fill: "var(--surface-subtle)",
                                }}
                            />

                            <Bar
                                dataKey="amount"
                                name="Spent"
                                fill="var(--brand)"
                                barSize={18}
                                radius={[0, 5, 5, 0]}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </section>
    );
}