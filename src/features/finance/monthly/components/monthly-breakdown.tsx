"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Button, LoadError, Select, Skeleton, SkeletonRegion } from "@/components/ui";
import { useFinance } from "../../store/finance-store";
import { subscribeDashboardClock } from "@/features/dashboard/utils/dashboard-clock";
import { formatMonthlyMoney } from "../format";
import { loadMonthlyBreakdown } from "../api";
import { browserMonth, buildMonthlyRows, monthLabel } from "../calculations";
import { sumMoney, type MonthlyBreakdownData } from "../contracts";
import { MonthlyCharts } from "./monthly-charts";
import { MonthlyTable } from "./monthly-table";
import { SpendingPlanDialog } from "./spending-plan-dialog";

const serverMonth = () => null;

export function MonthlyBreakdown() {
    const finance = useFinance();
    return <MonthlyBreakdownContent key={finance.userId ?? "signed-out"} />;
}

function MonthlyBreakdownContent() {
    const finance = useFinance();
    const currentMonth = useSyncExternalStore(subscribeDashboardClock, browserMonth, serverMonth);
    const [data, setData] = useState<MonthlyBreakdownData | null>(null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [editing, setEditing] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState("");

    useEffect(() => {
        if (!finance.ready || !finance.userId) return;
        const controller = new AbortController();
        void loadMonthlyBreakdown(controller.signal).then((response) => {
            if (!controller.signal.aborted) setData(response);
        }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
        return () => controller.abort();
    }, [finance.ready, finance.userId, attempt]);

    const retry = () => { setData(null); setFailed(false); setAttempt((value) => value + 1); };
    const rows = data && currentMonth ? buildMonthlyRows(data, finance.data.transactions, currentMonth) : [];
    const liveRows = rows.filter((row) => row.source === "live");
    const selected = liveRows.find((row) => row.month === selectedMonth) ?? liveRows.at(-1);
    const ideal = data?.plan ? sumMoney(data.plan.targets.map((target) => target.amount)) : null;

    return (
        <div className="min-w-0 space-y-6">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Monthly Breakdown</h1>
                    <p className="mt-2 max-w-3xl text-sm text-text-secondary">Historical spending and live monthly records. LEFT is income remaining after reported spending, not your bank balance.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <Link href="/finance" className="text-sm text-primary hover:underline">Finance overview</Link>
                    <Button disabled={!data || !finance.ready} onClick={() => setEditing(true)}>Manage spending plan</Button>
                </div>
            </header>
            {!finance.ready ? (
                finance.loadError ? <LoadError message="Unable to load your finance records. Please try again." onRetry={finance.retry} /> : <MonthlyLoading />
            ) : failed ? <LoadError message="Unable to load your monthly breakdown. Please try again." onRetry={retry} /> : !data || !currentMonth ? <MonthlyLoading /> : (
                <>
                    <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5" aria-label="Current plan and live income">
                        <div>
                            <p className="text-sm font-medium text-text-primary">Current IDEAL spending: {ideal === null ? "No plan saved" : formatMonthlyMoney(ideal)}</p>
                            <p className="mt-1 text-xs text-text-secondary">The IDEAL row uses an imported income reference only. Editing targets never changes historical snapshots.</p>
                        </div>
                        {selected ? (
                            <div className="space-y-2">
                                <Select id="monthly-live-income" label="Compare plan with live income" value={selected.month} options={liveRows.map((row) => ({ label: monthLabel(row.month), value: row.month }))} onChange={(value) => setSelectedMonth(value ?? "")} />
                                <p className="text-xs text-text-secondary">
                                    Actual income: {selected.income === null ? "Unavailable — no income recorded" : formatMonthlyMoney(selected.income)}
                                    {" · "}After current plan: {selected.income === null || ideal === null ? "Unavailable" : formatMonthlyMoney(sumMoney([selected.income, -ideal]))}
                                </p>
                            </div>
                        ) : <p className="text-xs text-text-muted">Live monthly reporting starts November 2026.</p>}
                    </section>
                    {!data.snapshots.length && <p className="text-sm text-text-secondary">Historical monthly spending is not available yet. Missing history is shown as unavailable.</p>}
                    <MonthlyCharts data={data} rows={rows} />
                    <MonthlyTable data={data} rows={rows} />
                    <p className="text-xs text-text-muted">Live totals include ordinary expenses, including Untracked expenses. Transfers and portfolio trades are excluded. The Invest column only counts expenses actually categorized as Invest. Fuel corresponds to the source spreadsheet&apos;s Fule label.</p>
                    {editing && <SpendingPlanDialog plan={data.plan} onClose={() => setEditing(false)} onSaved={(plan) => setData({ ...data, plan })} />}
                </>
            )}
        </div>
    );
}

function MonthlyLoading() {
    return (
        <SkeletonRegion label="Loading monthly breakdown" className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
        </SkeletonRegion>
    );
}
