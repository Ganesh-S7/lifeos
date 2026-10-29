import { formatMonthlyMoney } from "../format";
import { breakdownColumns, categoryAmount, monthLabel, type MonthlyRow } from "../calculations";
import { sumMoney, type MonthlyBreakdownData } from "../contracts";

export function MonthlyTable({ data, rows }: { data: MonthlyBreakdownData; rows: MonthlyRow[] }) {
    const columns = breakdownColumns(data, rows);
    const ideal = data.plan ? sumMoney(data.plan.targets.map((target) => target.amount)) : null;
    const reference = data.plan?.referenceIncome ?? null;
    const values = [
        {
            month: "IDEAL", source: "plan" as const, categories: data.plan?.targets ?? [], total: ideal,
            income: reference, left: ideal !== null && reference !== null ? sumMoney([reference, -ideal]) : null,
        },
        ...rows,
    ];
    const money = (value: number | null) => value === null ? <span aria-label="Unavailable">Unavailable</span> : value === 0 ? <span aria-label="Zero rupees">—</span> : formatMonthlyMoney(value);

    return (
        <section aria-labelledby="breakdown-table-title" className="min-w-0">
            <h2 id="breakdown-table-title" className="text-base font-semibold text-text-primary">Monthly breakdown</h2>
            <p className="mt-1 text-xs text-text-secondary">IDEAL is the current plan and reference income, not a real income transaction. Historical rows retain the supplied totals.</p>
            <div tabIndex={0} role="region" aria-label="Scrollable monthly breakdown table" className="mt-3 max-h-[70vh] overflow-auto rounded-xl border border-border bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                <table className="w-full border-separate border-spacing-0 text-xs tabular-nums">
                    <caption className="sr-only">Category spending, total, income and income remaining by month. Unavailable means no source record or no income transaction; a dash means zero rupees.</caption>
                    <thead>
                        <tr>
                            {["Month", ...columns, "TOTAL", "INCOME", "LEFT"].map((name, index) => (
                                <th key={name} scope="col" className={`sticky top-0 border-b border-border bg-surface-elevated px-4 py-3 font-semibold text-text-primary ${index === 0 ? "left-0 z-30 min-w-36 text-left" : "z-20 min-w-28 text-right"}`}>{name}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {values.map((row) => (
                            <tr key={row.month} className={row.source === "plan" ? "bg-sidebar-active" : "bg-surface"}>
                                <th scope="row" className={`sticky left-0 z-10 border-b border-border-subtle px-4 py-3 text-left font-medium text-text-primary ${row.source === "plan" ? "bg-sidebar-active" : "bg-surface"}`}>
                                    {row.month === "IDEAL" ? "IDEAL" : monthLabel(row.month)}
                                    <span className="mt-1 block text-[10px] font-normal text-text-secondary">{row.source === "plan" ? "Current plan · reference" : row.source === "historical" ? "Historical snapshot" : row.source === "live" ? "Recorded transactions" : "History unavailable"}</span>
                                </th>
                                {columns.map((name) => (
                                    <td key={name} className="border-b border-border-subtle px-4 py-3 text-right text-text-secondary">
                                        {money(row.source === "unavailable" || (row.source === "plan" && !data.plan) ? null : categoryAmount(row.categories, name))}
                                    </td>
                                ))}
                                {[row.total, row.income, row.left].map((value, index) => (
                                    <td key={index} className={`border-b border-l border-border-subtle px-4 py-3 text-right font-semibold ${index === 2 && value !== null && value < 0 ? "text-danger" : "text-text-primary"}`}>{money(value)}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
