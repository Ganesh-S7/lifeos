import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import {
    THEME_INIT_SCRIPT,
    THEME_STORAGE_KEY,
    getServerTheme,
    getTheme,
    parseTheme,
    setTheme,
    subscribeTheme,
} from "../src/lib/theme.ts";

const root = new URL("../src/", import.meta.url);
const themeUrl = new URL("lib/theme.ts", root).href;
const toggleUrl = new URL("components/theme/theme-toggle.tsx", root).href;
const toasterUrl = new URL("components/ui/toaster.tsx", root).href;
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "react" && context.parentURL?.startsWith("data:")) {
            return nextResolve(specifier, { ...context, parentURL: import.meta.url });
        }
        // Test the real toggle event handler against the real store; React
        // subscription/hydration and browser layout still need browser checks.
        if ((context.parentURL === toggleUrl && specifier === "./use-theme") ||
            (context.parentURL === toasterUrl && specifier === "@/components/theme/use-theme")) {
            const source = `import { getTheme, setTheme } from ${JSON.stringify(themeUrl)};
                export function useTheme() { return { theme: getTheme(), setTheme }; }`;
            return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        }
        if (context.parentURL === toasterUrl && specifier === "sonner") {
            const source = `import React from 'react';
                export function Toaster({theme}) { return React.createElement('div', {'data-theme': theme}); }`;
            return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        }
        const file = specifier.startsWith("@/")
            ? new URL(specifier.slice(2), root)
            : specifier.startsWith(".") && context.parentURL?.startsWith(root.href)
                ? new URL(specifier, context.parentURL)
                : null;
        if (file) {
            for (const extension of [".ts", ".tsx"]) {
                if (existsSync(new URL(file.href + extension))) {
                    return nextResolve(file.href + extension, context);
                }
            }
        }
        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (url.startsWith(root.href) && url.endsWith(".tsx")) {
            const source = ts.transpileModule(readFileSync(new URL(url), "utf8"), {
                compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
            }).outputText;
            return { format: "module", source, shortCircuit: true };
        }
        return nextLoad(url, context);
    },
});
const { ThemeToggle } = await import(toggleUrl);
const { Toaster } = await import(toasterUrl);
const { useTheme } = await import("../src/components/theme/use-theme.ts");
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
let storage;
let storageHandlers;

function fakeDocument() {
    const classes = new Set();
    return {
        documentElement: {
            classList: {
                contains: (name) => classes.has(name),
                toggle(name, enabled) {
                    if (enabled) classes.add(name);
                    else classes.delete(name);
                },
            },
        },
    };
}

beforeEach(() => {
    storage = new Map();
    storageHandlers = new Set();
    globalThis.document = fakeDocument();
    globalThis.window = {
        localStorage: {
            getItem: (key) => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, value),
        },
        addEventListener(name, handler) {
            assert.equal(name, "storage");
            storageHandlers.add(handler);
        },
        removeEventListener(name, handler) {
            assert.equal(name, "storage");
            storageHandlers.delete(handler);
        },
    };
});
afterEach(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
});

function initialize(document = globalThis.document, localStorage = window.localStorage) {
    runInNewContext(THEME_INIT_SCRIPT, { document, localStorage });
}

test("initialization defaults to light and restores only explicit saved light/dark preferences", () => {
    for (const [saved, expected] of [[null, "light"], ["dark", "dark"], ["light", "light"], ["system", "light"]]) {
        storage.clear();
        if (saved !== null) storage.set(THEME_STORAGE_KEY, saved);
        initialize();
        assert.equal(getTheme(), expected);
        assert.equal(parseTheme(saved), expected);
    }
    assert.equal(getServerTheme(), "light");
});

test("toggle has an accessible pressed state and changes/persists both theme choices", () => {
    for (const expected of ["dark", "light"]) {
        const button = ThemeToggle();
        assert.equal(button.props["aria-label"], "Dark mode");
        assert.equal(button.props["aria-pressed"], getTheme() === "dark");
        button.props.onClick();
        assert.equal(getTheme(), expected);
        assert.equal(storage.get(THEME_STORAGE_KEY), expected);
        const html = renderToStaticMarkup(React.createElement(ThemeToggle));
        assert.match(html, new RegExp(`aria-pressed="${expected === "dark"}"`));
        assert.match(html, /type="button"/);
        const nextDocument = fakeDocument();
        initialize(nextDocument);
        assert.equal(nextDocument.documentElement.classList.contains("dark"), expected === "dark");
        assert.match(renderToStaticMarkup(React.createElement(Toaster)), new RegExp(`data-theme="${expected}"`));
    }
});

test("subscriptions notify all consumers, sync other tabs and clean up listeners", () => {
    let first = 0;
    let second = 0;
    const unsubscribeFirst = subscribeTheme(() => first++);
    const unsubscribeSecond = subscribeTheme(() => second++);
    try {
        assert.equal(storageHandlers.size, 1);
        setTheme("dark");
        assert.deepEqual([first, second], [1, 1]);
        for (const handler of storageHandlers) handler({ key: "unrelated", newValue: "light" });
        assert.equal(getTheme(), "dark");
        for (const handler of storageHandlers) handler({ key: THEME_STORAGE_KEY, newValue: "light" });
        assert.equal(getTheme(), "light");
        for (const handler of storageHandlers) handler({ key: THEME_STORAGE_KEY, newValue: "dark" });
        assert.equal(getTheme(), "dark");
        for (const handler of storageHandlers) handler({ key: null, newValue: null });
        assert.equal(getTheme(), "light");
    } finally {
        unsubscribeFirst();
        unsubscribeSecond();
    }
    assert.equal(storageHandlers.size, 0);
});

test("unavailable storage defaults safely but still allows in-page toggling", () => {
    const unavailable = {
        getItem() { throw new Error("Storage unavailable"); },
        setItem() { throw new Error("Storage unavailable"); },
    };
    initialize(globalThis.document, unavailable);
    assert.equal(getTheme(), "light");
    window.localStorage = unavailable;
    setTheme("dark");
    assert.equal(getTheme(), "dark");
});

test("SSR uses light markup even if a client document already has the saved dark class", () => {
    setTheme("dark");
    function Probe() {
        return React.createElement("span", null, useTheme().theme);
    }
    assert.equal(renderToStaticMarkup(React.createElement(Probe)), "<span>light</span>");
    const layout = readFileSync(new URL("app/layout.tsx", root), "utf8");
    assert.match(layout, /<html lang="en" suppressHydrationWarning>/);
    assert.ok(layout.indexOf("THEME_INIT_SCRIPT }}") < layout.indexOf("<body"));
    assert.doesNotMatch(layout, /className="dark"/);
});

test("root layout registers the unchanged inline initializer with Next Script before hydration", () => {
    const layout = readFileSync(new URL("app/layout.tsx", root), "utf8");
    assert.match(layout, /import Script from "next\/script"/);
    const head = layout.match(/<head>([\s\S]*?)<\/head>/)?.[1];
    assert.ok(head, "Initializer stays in the root layout head");
    const scripts = [...head.matchAll(/<Script\b([\s\S]*?)\/>/g)];
    assert.equal(scripts.length, 1);
    assert.match(scripts[0][1], /id="lifeos-theme"/);
    assert.match(scripts[0][1], /strategy="beforeInteractive"/);
    assert.match(scripts[0][1], /dangerouslySetInnerHTML=\{\{ __html: THEME_INIT_SCRIPT \}\}/);
    assert.doesNotMatch(layout, /<script\b/);
});

test("current light and dark palettes match the intended colors and use theme-aware native controls", () => {
    const css = readFileSync(new URL("app/globals.css", root), "utf8");
    const light = css.match(/:root\s*\{([\s\S]*?)\n\}/)[1];
    const dark = css.match(/\.dark\s*\{([\s\S]*?)\n\}/)[1];
    for (const [block, colors] of [
        [light, {
            background: "#f7f7f5", surface: "#f5f5f5", "surface-elevated": "#ffffff",
            "text-primary": "#171717", "text-secondary": "#666660", border: "#e5e5e0",
            brand: "#5146d8", "brand-hover": "#4338b8", "brand-foreground": "#ffffff",
            "surface-hover": "#f0f0ed", success: "#15803d", warning: "#b45309", danger: "#b91c1c",
            "sidebar-active": "#efeeff", "sidebar-hover": "#eeeeea", info: "#3f82d7",
        }],
        [dark, {
            background: "#0a0c11", surface: "#11151b", "surface-elevated": "#171d26",
            "text-primary": "#f0f3f6", "text-secondary": "#9aa4b2", border: "#303846",
            brand: "#818cf8", "brand-hover": "#a5b4fc", "brand-foreground": "#0d1117",
            "surface-subtle": "#1d242e", "surface-hover": "#232b36", success: "#4ade80",
            warning: "#fbbf24", danger: "#f87171", info: "#61a0e8",
        }],
    ]) {
        for (const [name, color] of Object.entries(colors)) {
            assert.ok(block.includes(`--${name}: ${color};`), `${name}: ${color}`);
        }
    }
    assert.match(light, /color-scheme: light/);
    assert.match(dark, /color-scheme: dark/);
    assert.match(dark, /--sidebar-active: var\(--brand-subtle\)/);
    assert.match(dark, /--sidebar-hover: var\(--surface-hover\)/);
    assert.match(css, /@custom-variant dark/);
});

function luminance(hex) {
    const channels = hex.slice(1).match(/../g).map((value) => {
        const channel = parseInt(value, 16) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(first, second) {
    const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
}

test("palette keeps important text readable and interactive focus distinct in both themes", () => {
    const css = readFileSync(new URL("app/globals.css", root), "utf8");
    for (const block of [
        css.match(/:root\s*\{([\s\S]*?)\n\}/)[1],
        css.match(/\.dark\s*\{([\s\S]*?)\n\}/)[1],
    ]) {
        const tokens = Object.fromEntries(
            [...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/g)].map((match) => [match[1], match[2]]),
        );
        for (const surface of ["background", "surface", "surface-elevated", "surface-subtle", "surface-hover"]) {
            for (const text of ["text-primary", "text-secondary", "text-muted"]) {
                assert.ok(contrast(tokens[text], tokens[surface]) >= 4.5, `${text} on ${surface}`);
            }
            assert.ok(contrast(tokens.brand, tokens[surface]) >= 3, `Focus on ${surface}`);
        }
        for (const action of ["brand", "brand-hover", "brand-active"]) {
            assert.ok(contrast(tokens["brand-foreground"], tokens[action]) >= 4.5, action);
        }
        const activeNavigation = tokens["sidebar-active"] ?? tokens["brand-subtle"];
        const hoveredNavigation = tokens["sidebar-hover"] ?? tokens["surface-hover"];
        assert.ok(contrast(tokens.brand, activeNavigation) >= 4.5, "Active navigation text/icon");
        assert.ok(contrast(tokens["text-secondary"], hoveredNavigation) >= 4.5, "Navigation hover text");
        assert.ok(contrast(tokens["text-inverse"], tokens.danger) >= 4.5, "Destructive button");
        for (const status of ["success", "warning", "danger"]) {
            assert.ok(contrast(tokens[`${status}-foreground`], tokens[`${status}-subtle`]) >= 4.5, status);
        }
    }
});
