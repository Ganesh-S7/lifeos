import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as Menu from "@radix-ui/react-dropdown-menu";

// Exercise the actual header handlers; Radix's browser focus/keyboard behavior
// is delegated to its existing primitives and still requires browser review.
const root = new URL("../src/", import.meta.url);
const headerUrl = new URL("components/layout/header.tsx", root).href;
const reactUrl = import.meta.resolve("react");
const state = {};
const key = "lifeos.header-profile-tests";
globalThis[Symbol.for(key)] = state;
const ref = `globalThis[Symbol.for(${JSON.stringify(key)})]`;
let values;
let index;
state.useState = (initial) => {
    const slot = index++;
    if (!(slot in values)) values[slot] = initial;
    return [values[slot], (value) => { values[slot] = value; }];
};
state.useRef = (initial) => state.useState({ current: initial })[0];
const stubs = {
    "@/lib/auth-client": `export const authClient = {
        useSession() { return ${ref}.session; },
        signOut() { return ${ref}.signOut(); }
    };`,
    "next/navigation": `export function useRouter() { return ${ref}.router; }`,
    "./breadcrumbs": "export function Breadcrumbs() { return null; }",
    "@/components/theme/theme-toggle": "export function ThemeToggle() { return null; }",
    "@/components/ui": ["icon-button.tsx", "skeleton.tsx", "dropdown-menu/dropdown-menu.tsx"].map(
        (path) => `export * from ${JSON.stringify(new URL(`components/ui/${path}`, root).href)};`,
    ).join("\n"),
};
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (context.parentURL === headerUrl && specifier === "react") {
            const source = `export * from ${JSON.stringify(reactUrl)};
                export const {useState, useRef} = ${ref};`;
            return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        }
        if (stubs[specifier]) {
            return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
        }
        const file = specifier.startsWith("@/") ? new URL(specifier.slice(2), root) : null;
        if (file && existsSync(new URL(file.href + ".ts"))) return nextResolve(file.href + ".ts", context);
        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (url.startsWith(root.href) && url.endsWith(".tsx")) {
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
const { Header } = await import(headerUrl);
function render() {
    index = 0;
    return Header();
}
function nodes(node) {
    if (!node || typeof node !== "object") return [];
    return [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)];
}
const find = (tree, predicate) => nodes(tree).find(predicate);
const trigger = (tree) => find(tree, (node) => node.type === Menu.Trigger).props.children;
const item = (tree) => find(tree, (node) => node.props.onSelect);
const tick = () => new Promise((resolve) => setImmediate(resolve));
beforeEach(() => {
    values = [];
    state.session = { data: { user: { id: "one", name: "  Alex Smith  ", email: "alex@example.invalid" } }, isPending: false };
    state.calls = 0;
    state.signOut = async () => { state.calls++; return {}; };
    state.navigation = [];
    state.router = { replace: (path) => state.navigation.push(path), refresh: () => state.navigation.push("refresh") };
});

test("profile trigger is compact and accessible; portalled menu displays the current identity", () => {
    let tree = render();
    assert.equal(trigger(tree).props["aria-label"], "Account menu for Alex Smith");
    assert.equal(trigger(tree).props.disabled, false);
    assert.match(trigger(tree).props.className, /min-h-11 min-w-11/);
    assert.match(trigger(tree).props.className, /focus-visible:ring/);
    assert.ok(nodes(trigger(tree)).some((node) => node.props.className?.includes("hidden min-w-0 text-left xl:block")));
    const content = find(tree, (node) => node.props.collisionPadding);
    assert.equal(content.props.align, "end");
    assert.equal(content.props.collisionPadding, 12);
    assert.match(content.props.className, /max-w-\[calc\(100vw-1\.5rem\)\]/);
    assert.equal(content.props.onEscapeKeyDown, undefined, "Keep Radix Escape dismissal");
    assert.equal(content.props.onCloseAutoFocus, undefined, "Keep Radix focus return");
    assert.equal(content.props.onInteractOutside, undefined, "Keep Radix outside dismissal");
    const identity = renderToStaticMarkup(content.props.children[0]);
    assert.match(identity, /Alex Smith/);
    assert.match(identity, /alex@example.invalid/);
    assert.match(identity, />AS<\/span>/);
    assert.doesNotMatch(identity, /<button|<a/);
    assert.equal(item(tree).props.children.at(-1), "Log out");
    assert.match(item(tree).props.className, /text-danger/);
    assert.doesNotMatch(renderToStaticMarkup(trigger(tree)), /Sign out|Log out/);
    state.session.data.user = { id: "two", name: "Priya", email: "priya@example.invalid" };
    tree = render();
    assert.match(trigger(tree).props["aria-label"], /Priya/);
    const updatedIdentity = renderToStaticMarkup(find(tree, (node) => node.props.collisionPadding).props.children[0]);
    assert.match(updatedIdentity, /priya@example.invalid/);
    assert.doesNotMatch(updatedIdentity, /Alex/);
});

test("missing profile fields and loading sessions are handled without invented identity", () => {
    state.session = { data: null, isPending: true };
    assert.equal(trigger(render()).props.disabled, true);
    assert.match(renderToStaticMarkup(trigger(render())), /Loading account/);
    state.session = { data: { user: { name: "   " } }, isPending: false };
    const tree = render();
    const identity = renderToStaticMarkup(find(tree, (node) => node.props.collisionPadding).props.children[0]);
    assert.match(identity, /Personal account/);
    assert.doesNotMatch(identity, /@/);
});

test("logout reuses signOut and redirect/refresh, exposes pending state and blocks duplicates", async () => {
    let resolve;
    state.signOut = () => { state.calls++; return new Promise((done) => { resolve = done; }); };
    const action = item(render());
    let prevented = false;
    const event = { preventDefault() { prevented = true; } };
    action.props.onSelect(event);
    action.props.onSelect(event);
    assert.equal(prevented, true, "Keep the menu open to show pending/error feedback");
    assert.equal(state.calls, 1);
    assert.equal(item(render()).props.disabled, true);
    assert.match(renderToStaticMarkup(React.createElement("span", null, item(render()).props.children)), /Logging out/);
    assert.deepEqual(state.navigation, []);
    resolve({});
    await tick();
    assert.deepEqual(state.navigation, ["/login", "refresh"]);
});

test("returned and thrown logout errors retain existing safe feedback and permit retry", async () => {
    for (const throws of [false, true]) {
        state.signOut = async () => {
            if (throws) throw new Error("private diagnostic");
            return { error: { message: "private diagnostic" } };
        };
        item(render()).props.onSelect({ preventDefault() {} });
        await tick();
        const tree = render();
        const alert = find(tree, (node) => node.props.role === "alert");
        assert.equal(alert.props.children, throws
            ? "Something went wrong while signing out."
            : "Unable to sign out. Please try again.");
        assert.equal(item(tree).props.disabled, false);
        assert.deepEqual(state.navigation, []);
    }
});
