"use client";

import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils/currency";

import type { FinanceChartPoint } from "../../utils/finance-chart-data";

export function FinanceCharts({ data }: { data: FinanceChartPoint[] }) {
    const hasPosition = data.some((point) => point.netWorth !== null);
    const hasCashFlow = data.some((point) => point.income > 0 || point.expenses > 0);
    const axis = { fill: "var(--text-muted)", fontSize: 11 };
    return (
        <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="text-base font-semibold text-text-primary">Net worth trend</h2>
                <p className="mt-1 text-sm text-text-secondary">Your financial position over six months</p>
                <div className="mt-5 h-64">
                    {hasPosition ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data} margin={{ left: -14, right: 8 }}>
                                <defs>
                                    <linearGradient id="worth" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.25} />
                                        <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
                                <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} />
                                <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={(value) => `₹${Math.round(value / 1000)}k`} />
                                <Tooltip
                                    formatter={(value) => value == null ? "Unavailable" : formatCurrency(Number(value))}
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
                                    dataKey="netWorth"
                                    name="Net worth"
                                    stroke="var(--brand)"
                                    strokeWidth={2.5}
                                    fill="url(#worth)"
                                    dot={{ r: 3 }}
                                    connectNulls={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="flex h-full items-center justify-center text-sm text-text-muted">
                            No financial position history yet.
                        </p>
                    )}
                </div>
                <p className="mt-3 text-xs text-text-muted">
                    Recorded monthly positions only; gaps indicate unavailable history. The latest point uses current records.
                </p>
            </section>
            <section className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="text-base font-semibold text-text-primary">Cash flow</h2>
                <p className="mt-1 text-sm text-text-secondary">Monthly income and ordinary expenses</p>
                <div className="mt-5 h-64">
                    {hasCashFlow ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data} margin={{ left: -14, right: 8 }}>
                                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
                                <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} />
                                <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={(value) => `₹${Math.round(value / 1000)}k`} />
                                <Tooltip
                                    formatter={(value) => value == null ? "Unavailable" : formatCurrency(Number(value))}
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
                                <Legend />
                                <Bar
                                    dataKey="income"
                                    name="Income"
                                    fill="var(--chart-income)"
                                    radius={[4, 4, 0, 0]}
                                />
                                <Bar
                                    dataKey="expenses"
                                    name="Expenses"
                                    fill="var(--chart-expenses)"
                                    radius={[4, 4, 0, 0]}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="flex h-full items-center justify-center text-sm text-text-muted">
                            No income or expenses recorded in this period.
                        </p>
                    )}
                </div>
                <p className="mt-3 text-xs text-text-muted">Recorded income and ordinary expenses only. The current month runs through today.</p>
            </section>
        </div>
    );
}
