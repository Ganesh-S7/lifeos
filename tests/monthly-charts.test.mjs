import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = new URL("../src/", import.meta.url);
const captured = {};
globalThis[Symbol.for("lifeos.monthly-chart-tests")] = captured;
const ref = 'globalThis[Symbol.for("lifeos.monthly-chart-tests")]';
const primitives = [
    "Bar", "CartesianGrid", "Cell", "ComposedChart", "Line", "LineChart",
    "ResponsiveContainer", "Tooltip", "XAxis", "YAxis",
];

// Capture the props passed to Recharts. Real browser checks verify SVG layout;
// these tests protect sizing configuration, full datasets, and exact tooltips.
registerHooks({
    resolve(specifier, context, nextResolve) {
        let source;
        if (specifier === "recharts") {
            source = `import React from 'react'; ${primitives.map((name) => `
                export function ${name}(props) {
                    (${ref}.${name} ??= []).push(props);
                    return React.createElement('div', {className: props.className}, props.children);
                }`).join("\n")}`;
        } else if (specifier === "@/components/ui") {
            source = `import React from 'react'; export function Select(props) {
                ${ref}.select = props;
                return React.createElement('select', {id: props.id, defaultValue: props.value},
                    props.options.map(option => React.createElement('option', {key: option.value, value: option.value}, option.label)));
            }`;
        }
        if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        if (specifier === "react" && context.parentURL?.startsWith("data:")) {
            return nextResolve(specifier, { ...context, parentURL: import.meta.url });
        }
        const file = specifier.startsWith("@/") ? new URL(specifier.slice(2), root)
            : specifier.startsWith(".") && context.parentURL?.startsWith(root.href) ? new URL(specifier, context.parentURL) : null;
        if (file) {
            for (const extension of [".ts", ".tsx"]) {
                if (existsSync(new URL(file.href + extension))) return nextResolve(file.href + extension, context);
            }
        }
        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (url.startsWith(root.href) && url.endsWith(".tsx")) return {
            format: "module",
            shortCircuit: true,
            source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
                compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
            }).outputText,
        };
        return nextLoad(url, context);
    },
});

const { MonthlyCharts } = await import("../src/features/finance/monthly/components/monthly-charts.tsx");
const { buildMonthlyRows } = await import("../src/features/finance/monthly/calculations.ts");
const data = {
    snapshots: [{
        month: "2025-12",
        categories: [{ name: "Groceries", amount: 1250.25 }],
        total: 1250.25,
        income: 3000,
        left: 1749.75,
    }],
    plan: {
        targets: [{ name: "Groceries", amount: 1500.50 }],
        referenceIncome: 3000,
        updatedAt: "2026-10-30T00:00:00Z",
    },
};
const rows = buildMonthlyRows(data, [], "2026-12");

function render(dataset = data, monthlyRows = rows) {
    for (const key of Object.keys(captured)) delete captured[key];
    return renderToStaticMarkup(React.createElement(MonthlyCharts, { data: dataset, rows: monthlyRows }));
}

test("both charts use their card width without minimum-width canvases or scroll wrappers", () => {
    const html = render();
    assert.equal(captured.ResponsiveContainer.length, 2);
    for (const container of captured.ResponsiveContainer) {
        assert.equal(container.width, "100%");
        assert.equal(container.height, "100%");
        assert.equal(container.minWidth, 0);
    }
    assert.match(html, /grid min-w-0 grid-cols-1/);
    assert.equal((html.match(/h-60 w-full min-w-0/g) ?? []).length, 2);
    assert.doesNotMatch(html, /overflow-x-auto|overflow-hidden|min-width:|Scrollable/);
});

test("tick density adapts to measured chart space while keeping endpoint labels and final point padding", () => {
    render();
    for (const axis of captured.XAxis) {
        assert.equal(axis.interval, "preserveStartEnd");
        assert.equal(axis.minTickGap, 20);
        assert.equal(axis.tick.fontSize, 11);
    }
    assert.equal(captured.LineChart[0].margin.right, 16);
    assert.equal(captured.ComposedChart[0].margin.right, 16);
    assert.deepEqual(captured.XAxis[1].padding, { left: 8, right: 8 });
});

test("responsive layout retains every historical/live month, full series, exact values and missing-data gaps", () => {
    render();
    for (const chart of [captured.ComposedChart[0], captured.LineChart[0]]) {
        assert.equal(chart.data.length, rows.length);
        assert.deepEqual(chart.data.map(point => point.month), rows.map(row => row.month));
        assert.equal(chart.data[0].total, 1250.25);
        assert.equal(chart.data[0].category, 1250.25);
        assert.equal(chart.data[1].category, null);
        assert.equal(chart.data[1].total, null);
        assert.equal(chart.data.at(-1).month, "2026-12");
        assert.ok(chart.data.every(point => point.plan === 1500.50));
    }
    assert.deepEqual(captured.Bar.map(bar => bar.dataKey), ["total", "income"]);
    assert.deepEqual(captured.Line.map(line => line.dataKey), ["plan", "category"]);
    assert.equal(captured.Line[1].connectNulls, false);
    for (const tooltip of captured.Tooltip) {
        assert.equal(tooltip.formatter(1250.25), "₹1,250.25");
        assert.equal(tooltip.formatter(null), "Unavailable");
    }
    assert.equal(captured.select.value, "Groceries");
    assert.equal(typeof captured.select.onChange, "function");
});

test("HTML legend wraps inside its card and uses the existing series colors and conditional plan", () => {
    const html = render();
    assert.match(html, /aria-label="Chart legend" class="[^"]*flex-wrap/);
    for (const label of ["Recorded spending", "Recorded income", "Current IDEAL reference"]) {
        assert.ok(html.includes(label));
    }
    assert.match(html, /background-color:var\(--chart-expenses\)/);
    assert.match(html, /background-color:var\(--chart-income\)/);
    assert.match(html, /border-dashed border-primary/);
    const withoutPlan = render({ ...data, plan: null });
    assert.doesNotMatch(withoutPlan, /Current IDEAL reference/);
    assert.deepEqual(captured.Line.map(line => line.dataKey), ["category"]);
});

test("unavailable history retains empty messages without inventing chart data", () => {
    const empty = { snapshots: [], plan: null };
    const html = render(empty, buildMonthlyRows(empty, [], "2026-10"));
    assert.match(html, /No monthly spending history available yet/);
    assert.match(html, /No monthly category history available yet/);
    assert.equal(captured.ResponsiveContainer, undefined);
    assert.doesNotMatch(html, /Chart legend/);
});
