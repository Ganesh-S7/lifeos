import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Render actual dashboard/chart components with a mocked shared store and UI primitives.
// This verifies data/empty/error presentation, not browser layout or a live database.
const key = "lifeos.finance-dashboard-test";
const boundary = {};
globalThis[Symbol.for(key)] = boundary;
const ref = `globalThis[Symbol.for(${JSON.stringify(key)})]`;
const root = new URL("../src/", import.meta.url);
const stubs = {
    "@/features/finance/store/finance-store": `export function useFinance() { return ${ref}.state; }`,
    "next/link": `import React from 'react'; export default function Link({children, href}) {
        return React.createElement('a', {href}, children);
    }`,
    "@/components/ui": `import React from 'react';
        export function Card({children}) { return React.createElement('div', null, children); }
        export function Button({children, onClick}) { return React.createElement('button', {onClick}, children); }
        export function Stat({label, value, description, footer}) {
            return React.createElement('div', null, label, value, description, footer);
        }
        export function Skeleton() { return React.createElement('span', null, 'Loading'); }
        export function SkeletonRegion({children, label}) { return React.createElement('div', null, label, children); }
        export const ChartSkeleton = Skeleton;
        export function LoadError({message}) { return React.createElement('div', null, message, ' Retry'); }
    `,
};
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "react" && context.parentURL?.startsWith("data:")) {
            return nextResolve(specifier, { ...context, parentURL: import.meta.url });
        }
        if (stubs[specifier]) {
            return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
        }
        if (specifier.startsWith("@/")) {
            const file = new URL(specifier.slice(2), root);
            for (const extension of [".ts", ".tsx"]) {
                const url = file.href + extension;
                if (existsSync(new URL(url))) return nextResolve(url, context);
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
const { OverviewStats } = await import("../src/features/dashboard/components/overview-stats.tsx");
const { SpendingOverview } = await import("../src/features/dashboard/components/spending-overview.tsx");
const { GoalsOverview } = await import("../src/features/dashboard/components/goals-overview.tsx");
const { FinanceCharts } = await import("../src/features/finance/components/overview/finance-charts.tsx");
const { formatCurrency } = await import("../src/lib/utils/currency.ts");
const { formatDateValue } = await import("../src/lib/utils/date.ts");
const empty = () => ({ accounts: [], investments: [], liabilities: [], transactions: [], positionHistory: [] });
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
function state(overrides = {}) {
    boundary.state = {
        data: empty(), ready: true, loadError: "", refreshError: "", refreshing: false,
        retry() { }, ...overrides,
    };
}

test("dashboard financial widgets render shared recorded totals, not the old mock amounts", () => {
    state();
    const date = formatDateValue(new Date());
    boundary.state.data.transactions = [
        { type: "income", amount: 1000, date },
        { type: "expense", amount: 75, date, category: "Food" },
        { type: "transfer", amount: 500, date },
        { type: "investment_purchase", amount: 200, date },
    ];
    const stats = render(OverviewStats);
    assert.ok(stats.includes(formatCurrency(75)));
    assert.ok(stats.includes(formatCurrency(925)));
    assert.doesNotMatch(stats, /16,240|18,500|8\.4%|12\.2%/);
    const spending = render(SpendingOverview);
    assert.ok(spending.includes(formatCurrency(75)));
    assert.match(spending, /Food/);
    assert.doesNotMatch(spending, /16,240|8\.4%|4,200|3,940/);
});

test("empty dashboard shows real zero totals, no expense categories and no invented goal", () => {
    state();
    assert.ok(render(OverviewStats).includes(formatCurrency(0)));
    assert.match(render(SpendingOverview), /No expenses recorded this month yet/);
    const goal = render(GoalsOverview);
    assert.match(goal, /No goal balance is available/);
    assert.doesNotMatch(goal, /1,24,000|2,00,000|62%|76,000/);
});

test("dashboard keeps loading, initial failure, and recoverable background error states distinct", () => {
    state({ ready: false });
    assert.match(render(OverviewStats), /Loading financial statistics/);
    assert.match(render(SpendingOverview), /Loading/);
    state({ ready: false, loadError: "Cannot load Finance" });
    assert.match(render(OverviewStats), /Cannot load Finance.*Retry/);
    assert.match(render(SpendingOverview), /Cannot load Finance.*Retry/);
    state({ refreshError: "Saved records retained" });
    assert.match(render(SpendingOverview), /Saved records retained.*Retry refresh/);
    assert.ok(render(OverviewStats).includes(formatCurrency(0)));
});

test("empty chart history renders honest empty states instead of chart samples", () => {
    const markup = render(FinanceCharts, {
        data: [{ month: "Oct", income: 0, expenses: 0, netWorth: null }],
    });
    assert.match(markup, /No financial position history yet/);
    assert.match(markup, /No income or expenses recorded in this period/);
    assert.doesNotMatch(markup, /illustrative|sample/i);
});

test("remaining shared dashboard mocks contain no financial statistics or financial activity", async () => {
    const { overviewStats, recentActivity } = await import("../src/features/dashboard/data/mock-data.ts");
    assert.ok(overviewStats.every((stat) => !/spend|saving|net worth|balance/i.test(stat.label)));
    assert.ok(recentActivity.every((activity) => activity.type !== "finance" && !/₹/.test(activity.description)));
});
