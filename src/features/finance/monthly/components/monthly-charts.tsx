"use client";

import { useState } from "react";
import {
    Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart,
    ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Select } from "@/components/ui";
import { formatCurrency } from "@/lib/utils/currency";
import { formatMonthlyMoney } from "../format";
import { breakdownColumns, categoryAmount, monthLabel, type MonthlyRow } from "../calculations";
import { sumMoney, type MonthlyBreakdownData } from "../contracts";

const axis = { fill: "var(--text-muted)", fontSize: 11 };
const tooltipStyle = {
    backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border)",
    borderRadius: 8, color: "var(--text-primary)", fontSize: 12, boxShadow: "none",
};
const money = (value: unknown) => value === null || value === undefined ? "Unavailable" : formatMonthlyMoney(Number(value));

export function MonthlyCharts({ data, rows }: { data: MonthlyBreakdownData; rows: MonthlyRow[] }) {
    const [selectedCategory, setSelectedCategory] = useState("Groceries");
    const columns = breakdownColumns(data, rows);
    const category = columns.includes(selectedCategory) ? selectedCategory : columns[0];
    const ideal = data.plan ? sumMoney(data.plan.targets.map((target) => target.amount)) : null;
    const points = rows.map((row) => ({
        ...row, label: monthLabel(row.month), plan: ideal,
        category: row.source === "unavailable" ? null : categoryAmount(row.categories, category),
    }));
    const available = rows.some((row) => row.source !== "unavailable");
    const minWidth = Math.max(520, points.length * 54);

    return (
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <section aria-labelledby="monthly-comparison-title" className="min-w-0 rounded-xl border border-border bg-surface p-4 sm:p-5">
                <h2 id="monthly-comparison-title" className="text-sm font-semibold text-text-primary">Monthly spending vs income and plan</h2>
                <p className="mt-1 text-xs text-text-secondary">Current plan reference across all months; it may differ from past plans. Red spending exceeds recorded income.</p>
                {available ? (
                    <div tabIndex={0} role="region" aria-label="Scrollable monthly spending and income chart" className="mt-4 overflow-x-auto">
                        <div className="h-60" style={{ minWidth }}>
                            <ResponsiveContainer width="100%" className="overflow-hidden" height="100%" minWidth={0}>
                                <ComposedChart data={points} accessibilityLayer margin={{ left: 2, right: 12 }}>
                                    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
                                    <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                                    <YAxis tick={axis} width={68} tickFormatter={(value) => formatCurrency(Number(value))} axisLine={false} tickLine={false} />
                                    <Tooltip filterNull={false} formatter={money} contentStyle={tooltipStyle} labelStyle={{ color: "var(--text-secondary)" }} cursor={{ fill: "var(--surface-hover)" }} />
                                    <Legend wrapperStyle={{ fontSize: 11, color: "var(--text-secondary)" }} />
                                    <Bar dataKey="total" name="Recorded spending" fill="var(--chart-expenses)" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                                        {rows.map((row) => <Cell key={row.month} fill={row.left !== null && row.left < 0 ? "var(--danger)" : "var(--chart-expenses)"} />)}
                                    </Bar>
                                    <Bar dataKey="income" name="Recorded income" fill="var(--chart-income)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                                    {data.plan && <Line dataKey="plan" name="Current IDEAL reference" stroke="var(--brand)" strokeDasharray="5 4" dot={false} isAnimationActive={false} />}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                ) : <p className="mt-5 text-sm text-text-muted">No monthly spending history available yet.</p>}
            </section>
            <section aria-labelledby="monthly-category-title" className="min-w-0 rounded-xl border border-border bg-surface p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2 id="monthly-category-title" className="text-sm font-semibold text-text-primary">Monthly category trend</h2>
                    <Select
                        id="monthly-category-trend"
                        label="Category trend"
                        value={category}
                        options={columns.map((name) => ({ label: name, value: name }))}
                        onChange={(value) => { if (value) setSelectedCategory(value); }}
                        className="w-40"
                    />
                </div>
                {available ? (
                    <div tabIndex={0} role="region" aria-label={`${category} spending chart`} className="mt-4 overflow-x-auto">
                        <div className="h-60" style={{ minWidth }}>
                            <ResponsiveContainer className="overflow-hidden" width="100%" height="100%" minWidth={0}>
                                <LineChart data={points} accessibilityLayer margin={{ left: 2, right: 12 }}>
                                    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
                                    <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                                    <YAxis tick={axis} width={68} tickFormatter={(value) => formatCurrency(Number(value))} axisLine={false} tickLine={false} />
                                    <Tooltip formatter={money} contentStyle={tooltipStyle} labelStyle={{ color: "var(--text-secondary)" }} />
                                    <Line dataKey="category" name={category} stroke="var(--brand)" strokeWidth={2} connectNulls={false} dot={{ r: 3 }} isAnimationActive={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                ) : <p className="mt-5 text-sm text-text-muted">No monthly category history available yet.</p>}
                <p className="mt-2 text-xs text-text-muted">All available months are retained. Gaps mean unavailable history, not zero spending.</p>
            </section>
        </div>
    );
}
