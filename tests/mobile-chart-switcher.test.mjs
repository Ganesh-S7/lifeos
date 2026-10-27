import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import React from "react";
import ts from "typescript";

// Exercise selection handlers on the real component, without claiming browser layout coverage.
const target = new URL("../src/components/ui/chart-switcher.tsx", import.meta.url).href;
const reactUrl = import.meta.resolve("react");
const key = "lifeos.mobile-chart-selection";
const state = { selected: undefined };
globalThis[Symbol.for(key)] = state;
const ref = `globalThis[Symbol.for(${JSON.stringify(key)})]`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === target && specifier === "react") {
      return {
        url: `data:text/javascript,${encodeURIComponent(`
          export { createContext } from ${JSON.stringify(reactUrl)};
          export function useState(initial) {
            ${ref}.selected ??= initial;
            return [${ref}.selected, (value) => { ${ref}.selected = value; }];
          }
          export function useId() { return 'chart-selector'; }
          export function useContext() { return ${ref}.selected ?? null; }
        `)}`,
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/utils/cn") {
      return nextResolve(new URL("../src/lib/utils/cn.ts", import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === target) {
      return {
        format: "module",
        source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
          compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
        }).outputText,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});
const { ChartPanel, ChartSwitcher } = await import(target);
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}

test("phone chart selectors switch one panel without replacing data or desktop panels", () => {
  const options = [
    { value: "cash-flow", label: "Cash flow" },
    { value: "weight", label: "Weight" },
    { value: "spending", label: "Spending" },
  ];
  const charts = options.map(({ value }) => React.createElement("div", { key: value }, value));
  const render = () => ChartSwitcher({ label: "Your trends", options, children: charts });
  let tree = render();
  const selector = nodes(tree).find((node) => node.props.role === "group");
  assert.equal(selector.props["aria-labelledby"], "chart-selector");
  assert.match(nodes(tree).find((node) => node.type === "div").props.className, /md:hidden/);

  for (const option of options) {
    nodes(tree).find((node) => node.type === "button" && node.props.children === option.label).props.onClick();
    tree = render();
    const buttons = nodes(tree).filter((node) => node.type === "button");
    assert.equal(buttons.filter((button) => button.props["aria-pressed"]).length, 1);
    assert.equal(buttons.find((button) => button.props["aria-pressed"]).props.children, option.label);
    for (const [index, item] of options.entries()) {
      const panel = ChartPanel({ value: item.value, children: charts[index] });
      assert.equal(panel.props.children, charts[index]);
      assert.match(panel.props.className, /md:contents/);
      assert.equal(panel.props.className.split(" ").includes("hidden"), item.value !== option.value);
    }
  }
});

test("phone metric grids and progress use two columns while desktop charts retain their layouts", () => {
  const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
  for (const path of [
    "features/dashboard/components/overview-stats.tsx",
    "features/finance/components/overview/finance-overview.tsx",
    "features/health/components/health-summary.tsx",
  ]) {
    assert.match(read(path), /grid grid-cols-2/);
    assert.match(read(path), /compactMobile/);
    assert.match(read(path), /xl:grid-cols-4/);
  }
  assert.match(read("features/health/components/health-progress.tsx"), /grid grid-cols-2/);
  const logs = read("features/health/components/recent-health-logs.tsx");
  assert.match(logs, /<details/);
  assert.match(logs, /summary\.map/);
  assert.match(logs, /onEdit\(log\)/);
  assert.match(logs, /onDelete\(log\)/);
  assert.match(read("features/dashboard/components/overview-visualizations.tsx"), /xl:grid-cols-\[1.35fr_1fr\]/);
});
