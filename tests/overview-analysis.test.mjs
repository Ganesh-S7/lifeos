import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { registerHooks } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import { getHealthAnalyticsTrend, getWeightTrend } from "../src/features/health/utils/health-calculations.ts";
import { formatDateDisplay, formatDateValue } from "../src/lib/utils/date.ts";
import { formatCurrency } from "../src/lib/utils/currency.ts";

const { buildFinanceChartData } = await import("../src/features/finance/utils/finance-chart-data.ts");

// Real component markup and calculation helpers, with store snapshots at the
// authenticated boundary. Capture Recharts props because SSR has no resize/layout.
const root = new URL("../src/", import.meta.url);
const boundary = {};
const key = "lifeos.overview-analysis-tests";
globalThis[Symbol.for(key)] = boundary;
const ref = `globalThis[Symbol.for(${JSON.stringify(key)})]`;
const chartNames = [
    "Bar", "BarChart", "CartesianGrid", "Legend", "Line", "LineChart",
    "ResponsiveContainer", "Tooltip", "XAxis", "YAxis", "Pie", "PieChart",
];
const stubs = {
    "@/features/finance/store/finance-store": `export function useFinance() { return ${ref}.finance; }`,
    "@/lib/auth-client": `export const authClient = { useSession() { return ${ref}.session; } };`,
    "@/features/health/store/health-store": `
        export function useHealthHydration() {}
        export function useHealthStore() { return ${ref}.health; }
    `,
    "next/link": `import React from 'react'; export default function Link({children, ...props}) {
        return React.createElement('a', props, children);
    }`,
    "@/components/ui": ["card", "skeleton", "content-skeletons", "load-error", "button", "stat", "info-tooltip"].map(
        (name) => `export * from ${JSON.stringify(new URL(`components/ui/${name}.tsx`, root).href)};`,
    ).join("\n"),
    recharts: `import React from 'react'; ${chartNames.map((name) => `
        export function ${name}(props) {
            ${ref}.chartProps.push({ component: '${name}', ...props });
            return React.createElement('div', { 'data-chart': '${name}', 'aria-label': props['aria-label'] }, props.children);
        }
    `).join("\n")}`,
};
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "react" && context.parentURL?.startsWith("data:")) {
            return nextResolve(specifier, { ...context, parentURL: import.meta.url });
        }
        if (stubs[specifier]) {
            return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
        }
        const file = specifier.startsWith("@/")
            ? new URL(specifier.slice(2), root)
            : specifier.startsWith(".") && context.parentURL?.startsWith(root.href)
                ? new URL(specifier, context.parentURL)
                : null;
        if (file) {
            for (const extension of [".ts", ".tsx"]) {
                if (existsSync(new URL(file.href + extension))) return nextResolve(file.href + extension, context);
            }
        }
        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (url.startsWith(root.href) && url.endsWith(".tsx")) {
            const source = ts.transpileModule(readFileSync(new URL(url), "utf8"), {
                compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
            }).outputText;
            return { format: "module", source, shortCircuit: true };
        }
        return nextLoad(url, context);
    },
});
const { OverviewAnalysis, IncomeExpensesChart, WeightTrendChart } = await import(
    "../src/features/dashboard/components/overview-analysis.tsx"
);
const { SpendingOverview } = await import("../src/features/dashboard/components/spending-overview.tsx");
const { OverviewStats } = await import("../src/features/dashboard/components/overview-stats.tsx");
const empty = () => ({ accounts: [], investments: [], liabilities: [], transactions: [], positionHistory: [] });
const transaction = (type, amount, date, recordedAt = "2030-01-01T12:00:00Z") => ({
    id: `${type}-${date}`, type, amount, date, recordedAt, description: type, accountId: "bank",
});
const log = (date, weightKg) => ({
    id: `log-${date}`, date, weightKg, createdAt: "2030-01-01T12:00:00Z", updatedAt: "2030-01-01T12:00:00Z",
});
const today = formatDateValue(new Date());
function daysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return formatDateValue(date);
}
const render = (Component) => renderToStaticMarkup(React.createElement(Component));
const chart = (name) => boundary.chartProps.find((props) => props.component === name);
function nodes(tree) {
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    return React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}

beforeEach(() => {
    boundary.chartProps = [];
    boundary.financeRetries = 0;
    boundary.healthRetries = 0;
    boundary.finance = {
        data: empty(), ready: true, loadError: "", refreshError: "", refreshing: false,
        retry() { boundary.financeRetries++; },
    };
    boundary.session = { data: { user: { id: "user" } }, isPending: false };
    boundary.health = {
        logs: [], targets: null, ready: true, activeUserId: "user", loadError: null,
        async initializeForUser() { boundary.healthRetries++; },
    };
});

test("six local calendar months cross the year correctly and use transaction dates rather than save timestamps", () => {
    const data = empty();
    data.transactions = [
        transaction("income", 1200.5, "2025-12-31"),
        transaction("income", 500, "2026-01-01"),
        transaction("income", 100, "2026-01-10"),
        transaction("expense", 75.25, "2026-01-10"),
        transaction("expense", 9999, "2026-01-11"),
        transaction("income", 9999, "2026-02-01"),
        transaction("expense", 9999, "2025-07-31"),
    ];
    const before = structuredClone(data);
    const points = buildFinanceChartData(data, new Date(2026, 0, 10, 12));
    assert.deepEqual(points.map((point) => point.month), ["Aug", "Sept", "Oct", "Nov", "Dec", "Jan"]);
    assert.equal(points[4].income, 1200.5);
    assert.equal(points[5].income, 600);
    assert.equal(points[5].expenses, 75.25);
    assert.ok(points.slice(0, 4).every((point) => point.income === 0 && point.expenses === 0));
    assert.deepEqual(data, before);
});

test("ordinary cash-flow aggregation excludes every transfer and investment transaction", () => {
    const data = empty();
    data.transactions = [
        transaction("income", 800, today), transaction("expense", 120, today),
        transaction("transfer", 700, today), transaction("investment_purchase", 600, today),
        transaction("investment_sale", 500, today),
    ];
    const points = buildFinanceChartData(data);
    assert.equal(points.at(-1).income, 800);
    assert.equal(points.at(-1).expenses, 120);
    boundary.finance.data = data;
    const html = render(IncomeExpensesChart);
    assert.match(html, /Monthly income vs expenses/);
    assert.equal(chart("BarChart").data.at(-1).income, 800);
    assert.equal(chart("BarChart").data.at(-1).expenses, 120);
    assert.doesNotMatch(html, /<details|<summary|View monthly totals/);
    assert.match(html, /class="sr-only"><table/);
    assert.match(html, /Transfers and investment trades are excluded/);
});

test("weight points are chronological, use measurement dates, preserve gaps and never mutate records", () => {
    const logs = [
        log("2026-01-10", 70.3), log("2025-12-28", 71.2), log("2026-01-09", 70.5),
        log("2026-01-08", undefined), log("2026-01-11", 99), log("2025-10-12", 99),
    ];
    const before = structuredClone(logs);
    const now = new Date(2026, 0, 10, 12);
    assert.deepEqual(getWeightTrend(logs, now, 90), [
        { date: "2025-12-28", weightKg: 71.2 },
        { date: "2026-01-09", weightKg: 70.5 },
        { date: "2026-01-10", weightKg: 70.3 },
    ]);
    const series = getHealthAnalyticsTrend(logs, now, 90);
    assert.equal(series.length, 90);
    assert.equal(series[0].date, "2025-10-13");
    assert.equal(series.at(-1).date, "2026-01-10");
    assert.equal(series.find((point) => point.date === "2026-01-08").weightKg, undefined);
    assert.equal(series.filter((point) => point.weightKg !== undefined).length, 3);
    assert.deepEqual(logs, before);
});

test("empty and out-of-period Finance data offer navigation instead of a fabricated chart", () => {
    for (const transactions of [[], [transaction("income", 123, "2001-01-01")], [transaction("transfer", 500, today)]]) {
        boundary.finance.data.transactions = transactions;
        const html = render(IncomeExpensesChart);
        assert.match(html, /No income or expenses in this period/);
        assert.match(html, /href="\/finance"/);
        assert.doesNotMatch(html, /data-chart="BarChart"/);
    }
    assert.equal(boundary.chartProps.length, 0);
});

test("empty, missing and single-weight records offer Health navigation without a fake trend", () => {
    for (const logs of [[], [log(today, undefined)], [log("2001-01-01", 80)], [log(today, 69.5)]]) {
        boundary.health.logs = logs;
        const html = render(WeightTrendChart);
        assert.match(html, /No weight measurements in this period|One weight measurement recorded/);
        assert.match(html, /at least two different days/);
        assert.match(html, /href="\/health"/);
        assert.doesNotMatch(html, /data-chart="LineChart"/);
    }
    assert.equal(boundary.chartProps.length, 0);
});

test("loading uses skeletons and hides any cached measurements or transactions", () => {
    boundary.finance.ready = false;
    boundary.finance.data.transactions = [transaction("income", 54321, today)];
    boundary.health.ready = false;
    boundary.health.logs = [log(today, 87.6), log(daysAgo(2), 88.6)];
    const html = render(OverviewAnalysis);
    assert.match(html, /Loading monthly income and expenses/);
    assert.match(html, /Loading weight measurements/);
    assert.match(html, /aria-busy="true"/);
    assert.doesNotMatch(html, /54,321|87\.6|88\.6|data-chart/);
    assert.equal(boundary.chartProps.length, 0);
});

test("request failures show safe errors and retry the shared stores without a sample fallback", () => {
    boundary.finance.ready = false;
    boundary.finance.loadError = "PRIVATE_SQL_DETAILS";
    boundary.finance.data.transactions = [transaction("income", 54321, today)];
    boundary.health.ready = false;
    boundary.health.loadError = "PRIVATE_SQL_DETAILS";
    boundary.health.logs = [log(today, 87.6), log(daysAgo(2), 88.6)];
    const html = render(OverviewAnalysis);
    assert.match(html, /Unable to load your financial activity/);
    assert.match(html, /Unable to load your weight measurements/);
    assert.doesNotMatch(html, /PRIVATE_SQL_DETAILS|54,321|87\.6|88\.6|data-chart/);
    for (const tree of [IncomeExpensesChart(), WeightTrendChart()]) {
        const error = nodes(tree).find((node) => node.type.name === "LoadError");
        assert.ok(error);
        error.props.onRetry();
    }
    assert.equal(boundary.financeRetries, 1);
    assert.equal(boundary.healthRetries, 1);
    assert.equal(boundary.chartProps.length, 0);
});

test("weight chart masks another user's data and pending or signed-out sessions", () => {
    boundary.health.logs = [log(today, 87.6), log(daysAgo(2), 88.6)];
    for (const scenario of ["different-user", "pending", "signed-out"]) {
        boundary.health.activeUserId = scenario === "different-user" ? "old-user" : "user";
        boundary.session = {
            data: scenario === "signed-out" ? null : { user: { id: "user" } },
            isPending: scenario === "pending",
        };
        const html = render(WeightTrendChart);
        assert.match(html, /Loading weight measurements/);
        assert.doesNotMatch(html, /87\.6|88\.6|data-chart/);
    }
});

test("weight chart connects only actual ordered measurements with correct units and hidden accessible data", () => {
    boundary.health.logs = [log(today, 70.4), log(daysAgo(2), 71.1), log(daysAgo(1), undefined)];
    const html = render(WeightTrendChart);
    assert.equal(chart("LineChart").accessibilityLayer, true);
    assert.match(chart("LineChart")["aria-label"], /kilograms/);
    const points = chart("LineChart").data;
    assert.equal(points.length, 2);
    assert.equal(points.at(-1).weightKg, 70.4);
    assert.equal(points.at(-2).weightKg, 71.1);
    assert.equal(points.at(-2).date, daysAgo(2));
    assert.ok(points.every((point) => Number.isFinite(point.weightKg)));
    assert.equal(chart("Line").connectNulls, true);
    assert.equal(chart("Line").type, "linear");
    assert.equal(chart("Tooltip").formatter(70.4), "70.4 kg");
    assert.equal(chart("Tooltip").labelFormatter(today), formatDateDisplay(today));
    assert.doesNotMatch(html, /<details|<summary|View recorded weights/);
    assert.match(html, /class="sr-only"><table/);
    assert.match(html, /70\.4 kg/);
    assert.match(html, /71\.1 kg/);
    assert.equal((html.match(/scope="row"/g) ?? []).length, 2);
});

test("Finance updates and failed refreshes show saved chart data with an explicit refresh warning", () => {
    boundary.finance.data.transactions = [transaction("income", 1000, today)];
    render(IncomeExpensesChart);
    assert.equal(chart("BarChart").data.at(-1).income, 1000);
    boundary.finance.data.transactions.push(transaction("expense", 75, today));
    boundary.finance.refreshError = "PRIVATE_REFRESH_ERROR";
    boundary.chartProps = [];
    const html = render(IncomeExpensesChart);
    assert.equal(chart("BarChart").data.at(-1).expenses, 75);
    assert.match(html, /Your saved data is shown/);
    assert.match(html, /Retry refresh/);
    assert.doesNotMatch(html, /PRIVATE_REFRESH_ERROR/);
    assert.equal(chart("Tooltip").formatter(1000), formatCurrency(1000));
});

test("weight rendering rejects invalid measurements while retaining the valid dated records", () => {
    boundary.health.logs = [
        log(today, 70.4), log(daysAgo(1), undefined), log(daysAgo(2), NaN),
        log(daysAgo(3), Infinity), log(daysAgo(4), 0), log(daysAgo(5), -5),
        log(daysAgo(6), "invalid"), log(daysAgo(7), 71.1),
    ];
    render(WeightTrendChart);
    assert.deepEqual(chart("LineChart").data, [
        { date: daysAgo(7), weightKg: 71.1 }, { date: today, weightKg: 70.4 },
    ]);
});

test("spending donut uses actual through-today category totals and excludes other transaction types", () => {
    boundary.finance.data.transactions = [
        { ...transaction("expense", 90, today), category: "Food" },
        { ...transaction("expense", 10, today), category: "Food" },
        { ...transaction("expense", 25, today), category: "Transport" },
        { ...transaction("expense", 9999, daysAgo(-1)), category: "Bills" },
        { ...transaction("expense", 9999, "2001-01-01"), category: "Bills" },
        transaction("income", 5000, today), transaction("transfer", 5000, today),
        transaction("investment_purchase", 5000, today), transaction("investment_sale", 5000, today),
    ];
    const html = render(SpendingOverview);
    assert.deepEqual(chart("Pie").data.map(({ category, amount }) => [category, amount]), [["Food", 100], ["Transport", 25]]);
    assert.equal(chart("Pie").dataKey, "amount");
    assert.equal(chart("Pie").innerRadius, "58%");
    assert.ok(chart("Pie").data.every((slice) => /^var\(--chart-/.test(slice.fill)));
    assert.match(html, /Spending category totals/);
    assert.match(html, /80%/);
    assert.match(html, /20%/);
    assert.match(html, /₹125/);
    assert.doesNotMatch(html, /Bills|9,999|5,000|style="width:/);
    assert.equal(chart("Tooltip").formatter(100), formatCurrency(100));
});

test("spending donut keeps empty, loading and API-failure states honest and retryable", () => {
    let html = render(SpendingOverview);
    assert.match(html, /No expenses recorded this month yet/);
    assert.equal(chart("Pie"), undefined);
    boundary.finance.ready = false;
    html = render(SpendingOverview);
    assert.match(html, /Loading spending by category/);
    assert.match(html, /aria-busy="true"/);
    boundary.finance.loadError = "PRIVATE_DATABASE_DETAILS";
    html = render(SpendingOverview);
    assert.match(html, /Unable to load your spending/);
    assert.doesNotMatch(html, /PRIVATE_DATABASE_DETAILS|data-chart/);
    const error = nodes(SpendingOverview()).find((node) => node.type.name === "LoadError");
    error.props.onRetry();
    assert.equal(boundary.financeRetries, 1);
    assert.equal(chart("Pie"), undefined);
});

test("all four Overview stats share one supporting row and accessible contextual explanations", () => {
    boundary.finance.data.transactions = [transaction("income", 800, today), transaction("expense", 120, today)];
    boundary.health.logs = [{ ...log(today, 70.4), sleepMinutes: 420 }];
    boundary.health.targets = { weightGoalKg: 65, updatedAt: "test" };
    const html = render(OverviewStats);
    for (const label of ["About monthly spending", "About net cash flow", "About weight", "About latest sleep"]) {
        assert.ok(html.includes(`aria-label="${label}"`), label);
    }
    assert.equal((html.match(/class="[^"\n]*mt-auto pt-3"/g) ?? []).length, 4);
    assert.equal((html.match(/aria-describedby=/g) ?? []).length, 4);
    assert.match(html, /Goal: 65 kg/);
    assert.match(html, /same elapsed days/);
    assert.match(html, /excluding transfers and investment trades/);
    assert.ok(html.includes(formatDateDisplay(today)));
});

test("expense and category tokens are theme aware without borrowing status colors", () => {
    const css = readFileSync(new URL("app/globals.css", root), "utf8");
    const blocks = [css.match(/:root\s*\{([\s\S]*?)\n\}/)[1], css.match(/\.dark\s*\{([\s\S]*?)\n\}/)[1]];
    for (const [index, block] of blocks.entries()) {
        assert.ok(block.includes(`--chart-expenses: ${index === 0 ? "#a65f70" : "#d48d9d"};`));
        assert.match(block, /--chart-income: var\(--brand\)/);
        assert.doesNotMatch(block, /--chart-expenses: var\(--(?:warning|danger)/);
        for (let category = 3; category <= 7; category++) assert.ok(block.includes(`--chart-category-${category}:`));
    }
    const financeChart = readFileSync(new URL("features/finance/components/overview/finance-charts.tsx", root), "utf8");
    assert.match(financeChart, /fill="var\(--chart-expenses\)"/);
    boundary.finance.data.transactions = [transaction("expense", 25, today)];
    render(IncomeExpensesChart);
    assert.equal(boundary.chartProps.find((props) => props.component === "Bar" && props.dataKey === "expenses").fill, "var(--chart-expenses)");
});

test("chart surfaces, axes, legends and tooltips follow semantic theme tokens and responsive sizing", () => {
    boundary.finance.data.transactions = [transaction("income", 1000, today)];
    boundary.health.logs = [log(today, 70.4), log(daysAgo(2), 71.1)];
    const html = render(OverviewAnalysis);
    assert.match(html, /xl:grid-cols-2/);
    assert.match(html, /min-w-0/);
    assert.match(html, /bg-surface/);
    assert.match(html, /text-text-secondary/);
    assert.equal(boundary.chartProps.filter((props) => props.component === "Legend").length, 2);
    for (const props of boundary.chartProps.filter((props) => props.component === "Tooltip")) {
        assert.equal(props.contentStyle.backgroundColor, "var(--surface-elevated)");
        assert.equal(props.labelStyle.color, "var(--text-secondary)");
    }
    for (const props of boundary.chartProps.filter((props) => ["XAxis", "YAxis"].includes(props.component))) {
        assert.equal(props.tick.fill, "var(--text-secondary)");
    }
    for (const props of boundary.chartProps.filter((props) => props.component === "ResponsiveContainer")) {
        assert.equal(props.width, "100%");
        assert.equal(props.minWidth, 0);
    }
    const source = readFileSync(new URL("features/dashboard/components/overview-analysis.tsx", root), "utf8");
    assert.doesNotMatch(source, /#[0-9a-f]{6}|bg-white|text-black|dark:|mock-data/i);
});

test("calendar month and daily weight boundaries agree in UTC, Kolkata and Los Angeles", () => {
    const script = `
        import assert from 'node:assert/strict';
        await import(${JSON.stringify(new URL("helpers/register-typescript.mjs", import.meta.url).href)});
        const { buildFinanceChartData } = await import(${JSON.stringify(new URL("features/finance/utils/finance-chart-data.ts", root).href)});
        const { getHealthAnalyticsTrend } = await import(${JSON.stringify(new URL("features/health/utils/health-calculations.ts", root).href)});
        const today = new Date(2026, 0, 1, 0, 15);
        const points = buildFinanceChartData({ accounts: [], investments: [], liabilities: [], transactions: [
            {type: 'income', amount: 7, date: '2026-01-01', recordedAt: '2025-12-31T23:00:00Z'},
            {type: 'expense', amount: 3, date: '2025-12-31', recordedAt: '2026-01-01T00:00:00Z'},
            {type: 'income', amount: 999, date: '2026-01-02'}
        ]}, today);
        assert.equal(points.at(-1).month, 'Jan');
        assert.equal(points.at(-1).income, 7);
        assert.equal(points.at(-2).expenses, 3);
        const weights = getHealthAnalyticsTrend([
            {date: '2025-12-31', weightKg: 72}, {date: '2026-01-01', weightKg: 71}
        ], today, 2);
        assert.deepEqual(weights.map(({date, weightKg}) => [date, weightKg]), [['2025-12-31', 72], ['2026-01-01', 71]]);
    `;
    for (const TZ of ["UTC", "Asia/Kolkata", "America/Los_Angeles"]) {
        const env = { ...process.env, TZ };
        delete env.NODE_TEST_CONTEXT;
        const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
            env, encoding: "utf8", timeout: 30000,
        });
        assert.equal(result.status, 0, `${TZ}: ${result.stderr}`);
    }
});
