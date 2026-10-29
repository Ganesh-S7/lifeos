import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = new URL("../src/", import.meta.url);
const boundary = { finance: { ready: true, userId: "owner", data: { transactions: [] } } };
globalThis[Symbol.for("lifeos.monthly-tests")] = boundary;
const ref = 'globalThis[Symbol.for("lifeos.monthly-tests")]';
registerHooks({
    resolve(specifier, context, nextResolve) {
        let source;
        if (specifier === "@/features/finance/store/finance-store" || /store\/finance-store$/.test(specifier)) {
            source = `export function useFinance() { return ${ref}.finance; } export const financeActions = {loadCategories(){}};`;
        } else if (specifier === "@/lib/notifications") {
            source = "export const notify = {success(){}};";
        } else if (specifier === "@/components/ui") {
            source = `import React from 'react';
                export {Button} from ${JSON.stringify(new URL("components/ui/button.tsx", root).href)};
                export {IconButton} from ${JSON.stringify(new URL("components/ui/icon-button.tsx", root).href)};
                export {Input} from ${JSON.stringify(new URL("components/ui/input.tsx", root).href)};
                export {default as Select} from ${JSON.stringify(new URL("components/ui/select/select.tsx", root).href)};
                export function Skeleton(){return React.createElement('span',null,'Loading');}
                export function SkeletonRegion({children,label}){return React.createElement('div',null,label,children);}
                export function LoadError({message}){return React.createElement('div',{role:'alert'},message);}
                ${["Dialog", "DialogContent", "DialogDescription", "DialogFooter", "DialogHeader", "DialogTitle"].map((name) => `export function ${name}({children}){return React.createElement('div',null,children);}`).join("\n")}`;
        } else if (specifier === "next/link") {
            source = "import React from 'react'; export default function Link({href,children}){return React.createElement('a',{href},children);}";
        }
        if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        if (specifier === "react" && context.parentURL?.startsWith("data:")) return nextResolve(specifier, { ...context, parentURL: import.meta.url });
        const file = specifier.startsWith("@/") ? new URL(specifier.slice(2), root)
            : specifier.startsWith(".") && context.parentURL?.startsWith(root.href) ? new URL(specifier, context.parentURL) : null;
        if (file) {
            for (const extension of [".ts", ".tsx"]) if (existsSync(new URL(file.href + extension))) return nextResolve(file.href + extension, context);
        }
        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (url.startsWith(root.href) && url.endsWith(".tsx")) return {
            format: "module", shortCircuit: true,
            source: ts.transpileModule(readFileSync(new URL(url), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } }).outputText,
        };
        return nextLoad(url, context);
    },
});
const { readHistoricalSource, validateHistoricalData, normalizeSourceAmount } = await import("../src/features/finance/monthly/server/historical-import.ts");
const { buildMonthlyRows, breakdownColumns, categoryAmount } = await import("../src/features/finance/monthly/calculations.ts");
const { sumMoney, spendingPlanRequestSchema } = await import("../src/features/finance/monthly/contracts.ts");
const { MonthlyTable } = await import("../src/features/finance/monthly/components/monthly-table.tsx");
const { MonthlyCharts } = await import("../src/features/finance/monthly/components/monthly-charts.tsx");
const { MonthlyBreakdown } = await import("../src/features/finance/monthly/components/monthly-breakdown.tsx");
const { SpendingPlanDialog } = await import("../src/features/finance/monthly/components/spending-plan-dialog.tsx");
const { loadMonthlyBreakdown, putSpendingPlan } = await import("../src/features/finance/monthly/api.ts");
const source = readHistoricalSource();
const data = () => ({ snapshots: structuredClone(source.history), plan: { targets: structuredClone(source.ideal.categories), referenceIncome: 34800, updatedAt: "2026-10-30T00:00:00Z" } });
const raw = () => JSON.parse(readFileSync(new URL("../src/features/finance/monthly/server/historical-data.json", import.meta.url), "utf8"));
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

test("all 12 supplied rows and every category/total/income/LEFT match the authoritative dataset", () => {
    const rows = raw();
    const golden = rows.map((row) => [row.month, row.categories.map((category) => category.amount).join(","), row.total, row.income, row.left].join("|")).join("\n");
    // Pins every supplied amount independently of the reconciliation logic.
    assert.equal(createHash("sha256").update(golden).digest("hex"), "cbba6b877a18357043dbbbf18ee4861e228cb5bc026851c83ebd6ff5551ae45b");
    assert.equal(rows.length, 12);
    for (const row of rows) {
        assert.equal(sumMoney(row.categories.map((category) => category.amount)), row.total);
        assert.equal(row.income - row.total, row.left);
        assert.equal(row.income, 34800);
    }
    assert.equal(source.ideal.total, 33403);
    assert.equal(source.ideal.left, 1397);
    assert.equal(source.history.length, 11);
});

test("blanks/zeroes normalize, Fule maps only to Fuel, and discrepancies stop validation", () => {
    for (const value of ["", undefined, null, 0]) assert.equal(normalizeSourceAmount(value), 0);
    const rows = raw();
    rows[1].categories.find((item) => item.name === "Bike").amount = "";
    rows[1].categories.find((item) => item.name === "Fuel").name = "Fule";
    assert.equal(validateHistoricalData(rows).history[0].categories[8].name, "Fuel");
    rows[2].total++;
    assert.throws(() => validateHistoricalData(rows), /2026-01: category sum 34586 differs from supplied TOTAL 34587/);
    const wrongLeft = raw();
    wrongLeft[3].left--;
    assert.throws(() => validateHistoricalData(wrongLeft), /2026-02: LEFT/);
    assert.throws(() => validateHistoricalData(raw().slice(1)), /all 12/);
});

test("historical months are authoritative and live months use only qualifying monthly ledger entries", () => {
    const entry = (type, amount, date, category) => ({ type, amount, date, category });
    const transactions = [
        entry("income", 99999, "2026-10-01"), entry("expense", 99999, "2026-10-01", "Food"),
        entry("income", 20000, "2026-11-01"), entry("income", 14800, "2026-11-28"),
        entry("transfer", 50000, "2026-11-02"), entry("investment_purchase", 10000, "2026-11-03"), entry("investment_sale", 5000, "2026-11-04"),
        { ...entry("expense", 800, "2026-11-05", "GYM"), isUntracked: true },
        entry("expense", 2000, "2026-11-05", "Invest"), entry("expense", 26477, "2026-11-07", "Groceries"),
        entry("expense", 50, "2026-12-01", "New category"), entry("income", 100, "2027-01-01"),
    ];
    const rows = buildMonthlyRows(data(), transactions, "2026-12");
    assert.equal(rows.length, 13);
    assert.equal(rows[10].month, "2026-10");
    assert.equal(rows[10].total, 29277);
    assert.equal(rows[10].income, 34800);
    assert.equal(rows[11].total, 29277);
    assert.equal(rows[11].income, 34800);
    assert.equal(rows[11].left, 5523);
    assert.equal(categoryAmount(rows[11].categories, "GYM"), 800);
    assert.equal(categoryAmount(rows[11].categories, "Invest"), 2000);
    assert.equal(rows[12].income, null);
    assert.equal(rows[12].left, null);
    assert.equal(rows[12].total, 50);
    assert.ok(breakdownColumns(data(), rows).includes("New category"));
    assert.ok(!rows.some((row) => row.month === "2027-01"));
});

test("missing history remains unavailable, no income carries forward, and category names stay distinct", () => {
    const empty = { snapshots: [], plan: null };
    const rows = buildMonthlyRows(empty, [], "2027-01");
    assert.equal(rows.length, 14);
    assert.equal(rows[0].total, null);
    assert.equal(rows[11].total, 0);
    assert.equal(rows[11].income, null);
    assert.equal(rows[13].left, null);
    assert.equal(buildMonthlyRows(empty, [], "2026-10").length, 11, "No future live month is fabricated");
    const live = buildMonthlyRows(empty, [{ type: "expense", amount: 10, date: "2026-11-01", category: "Shopping" }], "2026-11");
    const columns = breakdownColumns(empty, live);
    assert.ok(columns.includes("Purchase") && columns.includes("Shopping"));
});

test("plan schema permits target add/edit/remove but rejects duplicates, invalid money and ownership fields", () => {
    for (const targets of [[], [{ name: "Food", amount: 0 }], [{ name: "New category", amount: 100.25 }]]) {
        assert.equal(spendingPlanRequestSchema.safeParse({ targets }).success, true);
    }
    for (const invalid of [
        { targets: [{ name: "Food", amount: 1 }, { name: " food ", amount: 2 }] },
        { targets: [{ name: "Food", amount: -1 }] }, { targets: [{ name: "Food", amount: 0.001 }] },
        { targets: [{ name: "Food", amount: "500" }] }, { targets: [], userId: "other" },
        { targets: [], referenceIncome: 99999 },
    ]) assert.equal(spendingPlanRequestSchema.safeParse(invalid).success, false);
});

test("table preserves column order, sticky scroll behavior, reference plan and historical LEFT", () => {
    const dataset = data();
    const html = render(MonthlyTable, { data: dataset, rows: buildMonthlyRows(dataset, [], "2026-10") });
    assert.match(html, /<table/);
    assert.match(html, /scope="col"/);
    assert.match(html, /scope="row"/);
    assert.match(html, /sticky top-0/);
    assert.match(html, /sticky left-0/);
    assert.match(html, /overflow-auto/);
    assert.ok(html.indexOf(">IDEAL<") < html.indexOf("Dec 25"));
    assert.ok(html.indexOf(">Rent<") < html.indexOf(">Groceries<"));
    assert.ok(html.indexOf(">Invest<") < html.indexOf(">TOTAL<"));
    assert.match(html, /₹33,403/);
    assert.match(html, /₹1,397/);
    assert.match(html, /text-danger/);
    assert.doesNotMatch(html, /bg-white|text-black|#[0-9a-f]{6}/i);
});

test("monthly money preserves paise and chart colors resolve to existing theme tokens", async () => {
    const { formatMonthlyMoney } = await import("../src/features/finance/monthly/format.ts");
    assert.equal(formatMonthlyMoney(1250.25), "₹1,250.25");
    assert.equal(formatMonthlyMoney(7000), "₹7,000");
    const css = readFileSync(new URL("app/globals.css", root), "utf8");
    const chart = readFileSync(new URL("features/finance/monthly/components/monthly-charts.tsx", root), "utf8");
    for (const [, name] of chart.matchAll(/var\((--[\w-]+)\)/g)) assert.ok(css.includes(`${name}:`), name);
});

test("charts and plan dialog reuse actual rows and saved targets; SSR loading contains no history fallback", () => {
    const dataset = data();
    const rows = buildMonthlyRows(dataset, [], "2026-10");
    const charts = render(MonthlyCharts, { data: dataset, rows });
    assert.match(charts, /Monthly spending vs income and plan/);
    assert.match(charts, /Current plan reference/);
    assert.match(charts, /Category trend/);
    const dialog = render(SpendingPlanDialog, { plan: dataset.plan, onClose() {}, onSaved() {} });
    assert.match(dialog, /Manage spending plan/);
    assert.match(dialog, /₹33,403/);
    assert.match(dialog, /Add category target/);
    assert.match(dialog, /Remove Rent target/);
    assert.match(dialog, /value="7000"/);
    const page = render(MonthlyBreakdown);
    assert.match(page, /Loading monthly breakdown/);
    assert.doesNotMatch(page, /₹33,403|₹34,800|Dec 25/);
    boundary.finance.ready = false;
    boundary.finance.loadError = "private database details";
    assert.match(render(MonthlyBreakdown), /Unable to load your finance records/);
    assert.doesNotMatch(render(MonthlyBreakdown), /private database details/);
    boundary.finance.ready = true;
});

test("typed client loads persisted records, sends plan-only writes and never falls back on failures", async (t) => {
    t.mock.method(globalThis, "fetch", async (url, options) => {
        assert.equal(url, "/api/finance/monthly-breakdown");
        if (options.method === "PUT") {
            assert.deepEqual(JSON.parse(options.body), { targets: [{ name: "Food", amount: 500 }] });
            return Response.json({ plan: { ...data().plan, targets: [{ name: "Food", amount: 500 }] } });
        }
        assert.equal(options.cache, "no-store");
        return Response.json(data());
    });
    assert.equal((await loadMonthlyBreakdown()).snapshots.length, 11);
    assert.equal((await putSpendingPlan({ targets: [{ name: "Food", amount: 500 }] })).targets[0].amount, 500);
    t.mock.method(globalThis, "fetch", async () => Response.json({ message: "SECRET" }, { status: 500 }));
    await assert.rejects(loadMonthlyBreakdown(), /Unable to load/);
    await assert.rejects(putSpendingPlan({ targets: [] }), /Unable to save/);
    t.mock.method(globalThis, "fetch", async () => { throw new Error("PRIVATE network diagnostic"); });
    await assert.rejects(putSpendingPlan({ targets: [] }), /^Error: Unable to save your spending plan\. Please try again\.$/);
    t.mock.method(globalThis, "fetch", async () => Response.json({ plan: { invalid: "PRIVATE" } }));
    await assert.rejects(putSpendingPlan({ targets: [] }), /^Error: Unable to save your spending plan\. Please try again\.$/);
});

