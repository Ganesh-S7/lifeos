import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import React from "react";
import ts from "typescript";

// Exercise the actual handlers with controlled hooks. Radix's browser positioning,
// touch events and Escape/outside-click dispatch still require browser review.
const target = new URL("../src/components/ui/info-tooltip.tsx", import.meta.url).href;
const reactUrl = import.meta.resolve("react");
const key = "lifeos.info-tooltip-tests";
const state = {};
globalThis[Symbol.for(key)] = state;
const ref = `globalThis[Symbol.for(${JSON.stringify(key)})]`;
state.hooks = {
    useState(initial) {
        const index = state.index++;
        if (!(index in state.values)) state.values[index] = initial;
        return [state.values[index], (value) => { state.values[index] = value; }];
    },
    useRef(initial) { return state.hooks.useState({ current: initial })[0]; },
    useId() { return "info-description"; },
    useEffect(setup) { state.cleanup ??= setup(); },
};
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (context.parentURL === target && specifier === "react") {
            const source = `export * from ${JSON.stringify(reactUrl)};
                export const { useState, useRef, useId, useEffect } = ${ref}.hooks;`;
            return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        }
        if (specifier === "@radix-ui/react-popover") {
            const source = ["Root", "Trigger", "Portal", "Content"].map(
                (name) => `export function ${name}() { return null; }`,
            ).join("\n");
            return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        }
        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (url === target) {
            return {
                format: "module", shortCircuit: true,
                source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
                    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
                }).outputText,
            };
        }
        return nextLoad(url, context);
    },
});
const { InfoTooltip } = await import(target);
function render() {
    state.index = 0;
    return InfoTooltip({ label: "About weight", children: "Latest recorded weight and target." });
}
function nodes(tree) {
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    return React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}
function find(tree, name) {
    return nodes(tree).find((node) => node.type === name || node.type.name === name);
}
function hoverTarget(tree) {
    return nodes(tree).find((node) => node.type === "span" && node.props.onPointerEnter);
}
beforeEach(() => {
    state.values = [];
    state.index = 0;
    state.cleanup = null;
});

test("information controls have an accessible label, description and nonmodal themed popover", () => {
    const tree = render();
    const button = find(tree, "button");
    assert.equal(button.props.type, "button");
    assert.equal(button.props["aria-label"], "About weight");
    assert.equal(button.props["aria-describedby"], "info-description");
    assert.ok(nodes(tree).some((node) => node.props.id === "info-description" && node.props.className === "sr-only"));
    assert.equal(tree.props.modal, false);
    const content = find(tree, "Content");
    assert.match(content.props.className, /bg-surface-elevated/);
    assert.match(content.props.className, /text-text-secondary/);
    assert.equal(content.props["aria-label"], "About weight");
});

test("mouse hover opens the explanation and allows movement into the popover before closing", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let tree = render();
    hoverTarget(tree).props.onPointerEnter({ pointerType: "mouse" });
    assert.equal(render().props.open, true);
    hoverTarget(tree).props.onPointerLeave();
    t.mock.timers.tick(100);
    find(tree, "Content").props.onPointerEnter();
    t.mock.timers.tick(200);
    assert.equal(render().props.open, true);
    tree = render();
    find(tree, "Content").props.onPointerLeave();
    t.mock.timers.tick(150);
    assert.equal(render().props.open, false);
});

test("keyboard focus opens the explanation and keeps it visible until blur or dismissal", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const tree = render();
    const button = find(tree, "button");
    button.props.ref.current = { matches: () => true };
    button.props.onFocus({ currentTarget: button.props.ref.current });
    assert.equal(render().props.open, true);
    hoverTarget(tree).props.onPointerLeave();
    t.mock.timers.tick(150);
    assert.equal(render().props.open, true);
    button.props.onBlur();
    assert.equal(render().props.open, false);
});

test("touch avoids synthetic hover and delegates toggle and dismissal to the installed Popover", () => {
    let tree = render();
    hoverTarget(tree).props.onPointerEnter({ pointerType: "touch" });
    find(tree, "button").props.onFocus({ currentTarget: { matches: () => false } });
    assert.equal(render().props.open, false);
    tree.props.onOpenChange(true);
    tree = render();
    assert.equal(tree.props.open, true);
    tree.props.onOpenChange(false);
    assert.equal(render().props.open, false);
    let prevented = 0;
    find(tree, "Content").props.onOpenAutoFocus({ preventDefault() { prevented++; } });
    find(tree, "Content").props.onCloseAutoFocus({ preventDefault() { prevented++; } });
    assert.equal(prevented, 2);
});

test("unmount cleanup cancels pending hover dismissal", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const tree = render();
    hoverTarget(tree).props.onPointerEnter({ pointerType: "mouse" });
    hoverTarget(tree).props.onPointerLeave();
    state.cleanup();
    t.mock.timers.tick(150);
    assert.equal(render().props.open, true);
});
