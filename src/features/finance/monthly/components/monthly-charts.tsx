"use client";

import { useState } from "react";
import {
    Bar, CartesianGrid, Cell, ComposedChart, Line, LineChart,
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

    return (
        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
            <section aria-labelledby="monthly-comparison-title" className="min-w-0 rounded-xl border border-border bg-surface p-4 sm:p-5">
                <h2 id="monthly-comparison-title" className="text-sm font-semibold text-text-primary">Monthly spending vs income and plan</h2>
                <p className="mt-1 text-xs text-text-secondary">Current plan reference across all months; it may differ from past plans. Red spending exceeds recorded income.</p>
                {available ? (
                    <>
                        <div role="region" aria-label="Monthly spending and income chart" className="mt-4 h-60 w-full min-w-0">
                            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                <ComposedChart data={points} accessibilityLayer margin={{ top: 8, left: 0, right: 16 }}>
                                    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
                                    <XAxis
                                        dataKey="label"
                                        tick={axis}
                                        interval="preserveStartEnd"
                                        minTickGap={20}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis tick={axis} width={68} tickFormatter={(value) => formatCurrency(Number(value))} axisLine={false} tickLine={false} />
                                    <Tooltip filterNull={false} formatter={money} contentStyle={tooltipStyle} labelStyle={{ color: "var(--text-secondary)" }} cursor={{ fill: "var(--surface-hover)" }} />
                                    <Bar dataKey="total" name="Recorded spending" fill="var(--chart-expenses)" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                                        {rows.map((row) => <Cell key={row.month} fill={row.left !== null && row.left < 0 ? "var(--danger)" : "var(--chart-expenses)"} />)}
                                    </Bar>
                                    <Bar dataKey="income" name="Recorded income" fill="var(--chart-income)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                                    {data.plan && <Line dataKey="plan" name="Current IDEAL reference" stroke="var(--brand)" strokeDasharray="5 4" dot={false} isAnimationActive={false} />}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                        <ul aria-label="Chart legend" className="mt-2 flex min-w-0 flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-text-secondary">
                            <li className="flex min-w-0 items-center gap-1.5">
                                <span
                                    aria-hidden="true"
                                    className="size-2.5 shrink-0 rounded-xs"
                                    style={{ backgroundColor: "var(--chart-expenses)" }}
                                />
                                Recorded spending
                            </li>
                            <li className="flex min-w-0 items-center gap-1.5">
                                <span
                                    aria-hidden="true"
                                    className="size-2.5 shrink-0 rounded-xs"
                                    style={{ backgroundColor: "var(--chart-income)" }}
                                />
                                Recorded income
                            </li>
                            {data.plan && (
                                <li className="flex min-w-0 items-center gap-1.5">
                                    <span aria-hidden="true" className="w-4 shrink-0 border-t-2 border-dashed border-primary" />
                                    Current IDEAL reference
                                </li>
                            )}
                        </ul>
                    </>
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
                        className="w-40 max-w-full"
                    />
                </div>
                {available ? (
                    <div role="region" aria-label={`${category} spending chart`} className="mt-4 h-60 w-full min-w-0">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            <LineChart data={points} accessibilityLayer margin={{ top: 8, left: 0, right: 16 }}>
                                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
                                <XAxis
                                    dataKey="label"
                                    tick={axis}
                                    interval="preserveStartEnd"
                                    minTickGap={20}
                                    padding={{ left: 8, right: 8 }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis tick={axis} width={68} tickFormatter={(value) => formatCurrency(Number(value))} axisLine={false} tickLine={false} />
                                <Tooltip formatter={money} contentStyle={tooltipStyle} labelStyle={{ color: "var(--text-secondary)" }} />
                                <Line dataKey="category" name={category} stroke="var(--brand)" strokeWidth={2} connectNulls={false} dot={{ r: 3 }} isAnimationActive={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                ) : <p className="mt-5 text-sm text-text-muted">No monthly category history available yet.</p>}
                <p className="mt-2 text-xs text-text-muted">All available months are retained. Gaps mean unavailable history, not zero spending.</p>
            </section>
        </div>
    );
}
