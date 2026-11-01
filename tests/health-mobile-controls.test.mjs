import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import React from "react";
import ts from "typescript";
import { formatDateValue } from "../src/lib/utils/date.ts";

const root = new URL("../src/", import.meta.url);
const analyticsUrl = new URL("features/health/components/health-analytics.tsx", root).href;
const reactUrl = import.meta.resolve("react");
const key = "lifeos.health-mobile-controls";
const state = {};
globalThis[Symbol.for(key)] = state;
state.hooks = {
    useState(initial) {
        const index = state.index++;
        if (!(index in state.values)) state.values[index] = initial;
        return [state.values[index], (value) => { state.values[index] = value; }];
    },
    useMemo(calculate) { return calculate(); },
};

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (context.parentURL === analyticsUrl && specifier === "react") {
            return {
                url: `data:text/javascript,${encodeURIComponent(`
                    export * from ${JSON.stringify(reactUrl)};
                    export const {useState,useMemo} = globalThis[Symbol.for(${JSON.stringify(key)})].hooks;
                `)}`,
                shortCircuit: true,
            };
        }
        if (specifier === "@/components/ui" || specifier === "recharts") {
            const names = specifier === "recharts"
                ? ["Area", "AreaChart", "CartesianGrid", "ResponsiveContainer", "Tooltip", "XAxis", "YAxis"]
                : ["Button", "Select"];
            return {
                url: `data:text/javascript,${encodeURIComponent(names.map(
                    name => `export function ${name}() { return null; }`,
                ).join("\n"))}`,
                shortCircuit: true,
            };
        }
        if (specifier.startsWith("@/")) {
            return nextResolve(new URL(`${specifier.slice(2)}.ts`, root).href, context);
        }
        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (url.startsWith(root.href) && url.endsWith(".tsx")) {
            assert.ok(existsSync(new URL(url)));
            return {
                format: "module",
                shortCircuit: true,
                source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
                    compilerOptions: {
                        jsx: ts.JsxEmit.ReactJSX,
                        module: ts.ModuleKind.ESNext,
                        target: ts.ScriptTarget.ES2022,
                    },
                }).outputText,
            };
        }
        return nextLoad(url, context);
    },
});

const { HealthProgress } = await import("../src/features/health/components/health-progress.tsx");
const { HealthAnalytics } = await import(analyticsUrl);

function nodes(tree) {
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    return React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}

function find(tree, name) {
    return nodes(tree).find(node => node.type === name || node.type.name === name);
}

function button(tree, label) {
    return nodes(tree).find(node => node.type === "button" && node.props["aria-label"] === label);
}

const logs = Array.from({ length: 40 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - 39 + index);
    return {
        id: `fixture-${index}`,
        date: formatDateValue(date),
        weightKg: 70 + index / 10,
        steps: 4000 + index,
        sleepMinutes: 420,
        waterMl: 2000,
        caloriesKcal: 1800,
        proteinGrams: 90,
        carbsGrams: 200,
        fiberGrams: 25,
    };
});

function analytics(input = logs) {
    state.index = 0;
    return HealthAnalytics({ logs: input });
}

beforeEach(() => {
    state.values = [];
    state.index = 0;
});

test("date arrows, Today and Edit targets preserve their original callbacks and future guard", () => {
    const changes = [];
    let edits = 0;
    const props = {
        metrics: [], selectedDate: "2026-11-01", todayDate: "2026-11-02",
        onSelectedDateChange: date => changes.push(date),
        onManageTargets: () => { edits++; },
    };
    const tree = HealthProgress(props);
    button(tree, "View previous day").props.onClick();
    button(tree, "View next day").props.onClick();
    nodes(tree).find(node => node.type === "button" && node.props.children === "Today").props.onClick();
    find(tree, "Button").props.onClick();
    assert.deepEqual(changes, ["2026-10-31", "2026-11-02", "2026-11-02"]);
    assert.equal(edits, 1);
    const today = HealthProgress({ ...props, selectedDate: props.todayDate });
    assert.equal(button(today, "View next day").props.disabled, true);
    button(today, "View next day").props.onClick();
    assert.equal(changes.length, 3);
});

test("all eight metric buttons remain selectable, and ranges retain explicit metric selection", () => {
    const labels = ["Weight", "Steps", "Sleep", "Water", "Calories", "Protein", "Carbs", "Fiber"];
    const buttons = nodes(analytics()).filter(node => node.type === "button");
    assert.deepEqual(buttons.map(node => node.props.children), labels);
    for (const label of labels) {
        nodes(analytics()).find(node => node.type === "button" && node.props.children === label).props.onClick();
        const active = nodes(analytics()).filter(node => node.props["aria-pressed"]);
        assert.deepEqual(active.map(node => node.props.children), [label]);
    }
    const range = find(analytics(), "Select");
    assert.deepEqual(range.props.options.map(option => option.value), ["7", "15", "30", "60", "90"]);
    range.props.onChange("7");
    let tree = analytics();
    assert.equal(find(tree, "AreaChart").props.data.length, 7);
    assert.equal(find(tree, "Area").props.dataKey, "fiberGrams");
    find(tree, "Select").props.onChange("90");
    tree = analytics();
    assert.equal(find(tree, "AreaChart").props.data.length, 40);
    assert.equal(find(tree, "Area").props.dataKey, "fiberGrams");
});

test("compact axes recover plot width without changing data, domain or tooltip units", () => {
    const desktop = analytics();
    assert.equal(find(desktop, "YAxis").props.width, 100);
    find(desktop, "ResponsiveContainer").props.onResize(240, 256);
    const mobile = analytics();
    assert.equal(find(mobile, "YAxis").props.width, 48);
    assert.deepEqual(find(mobile, "AreaChart").props.data, find(desktop, "AreaChart").props.data);
    assert.deepEqual(find(mobile, "YAxis").props.domain, find(desktop, "YAxis").props.domain);
    assert.equal(find(mobile, "YAxis").props.tickFormatter(70), "70");
    assert.deepEqual(find(mobile, "Tooltip").props.formatter(70), ["70 kg", "Weight"]);
    find(mobile, "ResponsiveContainer").props.onResize(1080, 288);
    assert.equal(find(analytics(), "YAxis").props.width, 100);
});

test("empty and single-measurement states retain honest Health analytics messaging", () => {
    const empty = analytics([]);
    assert.equal(find(empty, "AreaChart"), undefined);
    const single = analytics([logs.at(-1)]);
    assert.equal(find(single, "AreaChart").props.data.length, 1);
    assert.ok(nodes(single).some(node => node.type === "p" &&
        String(node.props.children).includes("One measurement is available")));
});
