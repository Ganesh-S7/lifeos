import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as Dialog from "@radix-ui/react-dialog";

import {
    isNavigationActive,
    navigationRoutes,
    resolveBreadcrumbs,
    sidebarNavigation,
} from "../src/lib/navigation.ts";

const root = new URL("../src/", import.meta.url);
const stateKey = "lifeos.shell-navigation-tests";
const state = {
    pathname: "/dashboard",
    session: { data: { user: { name: "Test User", email: "user@example.invalid" } }, isPending: false },
};
globalThis[Symbol.for(stateKey)] = state;
const ref = `globalThis[Symbol.for(${JSON.stringify(stateKey)})]`;
const stubs = {
    "next/link": `import React from 'react';
        export default function Link({children, ...props}) {
            return React.createElement('a', props, children);
        }`,
    "next/navigation": `export function usePathname() { return ${ref}.pathname; }
        export function useRouter() { return {}; }`,
    "@/lib/auth-client": `export const authClient = {
        useSession() { return ${ref}.session; }
    };`,
    "@/components/ui": `
        export { IconButton } from ${JSON.stringify(new URL("components/ui/icon-button.tsx", root).href)};
        export { Skeleton } from ${JSON.stringify(new URL("components/ui/skeleton.tsx", root).href)};
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
                compilerOptions: {
                    jsx: ts.JsxEmit.ReactJSX,
                    module: ts.ModuleKind.ESNext,
                    target: ts.ScriptTarget.ES2022,
                },
            }).outputText;
            return { format: "module", source, shortCircuit: true };
        }
        return nextLoad(url, context);
    },
});
const { Breadcrumbs } = await import("../src/components/layout/breadcrumbs.tsx");
const { Sidebar } = await import("../src/components/layout/sidebar.tsx");
const { AppShell } = await import("../src/components/layout/app-shell.tsx");
const render = (Component, props) => renderToStaticMarkup(
    Component === Sidebar
        ? React.createElement(Dialog.Root, { open: props.open }, React.createElement(Component, props))
        : React.createElement(Component, props),
);

test("breadcrumbs resolve implemented routes with meaningful labels and no duplicate parents", () => {
    for (const [path, expected] of [
        ["/dashboard", [["Overview", "/dashboard"]]],
        ["/health", [["Health", "/health"]]],
        ["/finance", [["Finance", "/finance"]]],
        ["/finance/expenses", [["Finance", "/finance"], ["Expenses", "/finance/expenses"]]],
        ["/finance/expenses/", [["Finance", "/finance"], ["Expenses", "/finance/expenses"]]],
    ]) {
        const items = resolveBreadcrumbs(path);
        assert.deepEqual(items.map(({ label, href }) => [label, href]), expected);
        assert.equal(new Set(items.map((item) => item.href)).size, items.length);
    }
    for (const path of ["/settings", "/goals", "/health/missing", "/finance/missing", "/unknown"]) {
        assert.deepEqual(resolveBreadcrumbs(path), []);
    }
});

test("rendered breadcrumbs link only parents and mark the current page as non-clickable", () => {
    for (const path of ["/dashboard", "/health", "/finance", "/finance/expenses"]) {
        state.pathname = path;
        const html = render(Breadcrumbs);
        assert.match(html, /aria-label="Breadcrumb"/);
        assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
        const expected = resolveBreadcrumbs(path);
        assert.ok(html.includes(`aria-current="page" class="truncate text-text-secondary">${expected.at(-1).label}</span>`));
        assert.ok(!html.includes(`href="${path}"`));
        if (path === "/finance/expenses") {
            assert.match(html, /<a href="\/finance"/);
        } else {
            assert.doesNotMatch(html, /<a /);
        }
    }
});

test("sidebar exposes only implemented pages and retains definitions for future destinations", () => {
    assert.deepEqual(sidebarNavigation.map((item) => item.href), ["/dashboard", "/finance", "/health"]);
    for (const route of navigationRoutes.filter((item) => item.implemented)) {
        assert.ok(existsSync(new URL(`app/(dashboard)${route.href}/page.tsx`, root)), route.href);
    }
    for (const href of ["/goals", "/habits", "/career", "/settings"]) {
        assert.ok(navigationRoutes.some((item) => item.href === href && !item.implemented));
        assert.ok(!sidebarNavigation.some((item) => item.href === href));
    }
    state.pathname = "/finance/expenses";
    const html = render(Sidebar, { open: false, onClose() {} });
    for (const href of ["/dashboard", "/finance", "/health"]) {
        assert.ok(html.includes(`href="${href}"`));
    }
    assert.match(html, /href="\/finance"[^>]*aria-current="page"/);
    assert.doesNotMatch(html, /href="\/(goals|habits|career|settings)"/);
    assert.equal(isNavigationActive("/finance-other", "/finance"), false);
    assert.equal(isNavigationActive("/health/", "/health"), true);
});

test("shared shell removes inactive search, notifications and workspace dropdown but retains account controls", () => {
    state.pathname = "/finance/expenses";
    const html = render(AppShell, { children: React.createElement("p", null, "Page content") });
    assert.doesNotMatch(html, /Search anything|aria-label="Search"|Notifications|Personal workspace|Loading workspace|User&#x27;s Life|User&apos;s Life/);
    assert.match(html, /aria-label="Sign out"/);
    assert.match(html, /aria-label="Open navigation"/);
    assert.match(html, /Test User/);
    assert.match(html, /user@example.invalid/);
    assert.match(html, /Page content/);
});

test("sidebar uses consistent workspace surfaces and scoped navigation colors on every implemented route", () => {
    for (const pathname of ["/dashboard", "/finance", "/finance/expenses", "/health"]) {
        state.pathname = pathname;
        const sidebar = render(Sidebar, { open: false, onClose() {} });
        assert.match(sidebar, /<aside[^>]*border-border-subtle bg-background/);
        assert.doesNotMatch(sidebar, /<aside[^>]*shadow-/);
        assert.match(sidebar, /aria-current="page"[^>]*bg-sidebar-active text-primary/);
        assert.match(sidebar, /hover:bg-sidebar-hover/);
        const shell = render(AppShell, { children: "Page content" });
        assert.match(shell, /<header[^>]*border-border-subtle bg-background/);
    }
});

test("mobile navigation uses a modal drawer with a trigger, accessible title and explicit close", () => {
    const sidebar = readFileSync(new URL("components/layout/sidebar.tsx", root), "utf8");
    const header = readFileSync(new URL("components/layout/header.tsx", root), "utf8");
    const shell = readFileSync(new URL("components/layout/app-shell.tsx", root), "utf8");
    // Radix owns focus trapping, Escape dismissal, outside dismissal and focus return.
    assert.match(shell, /<Dialog.Root open=\{sidebarOpen\} onOpenChange=\{setSidebarOpen\}/);
    assert.match(header, /<Dialog.Trigger asChild>/);
    assert.doesNotMatch(header, /onMenuClick/);
    for (const primitive of ["Portal", "Overlay", "Content", "Title", "Close"]) {
        assert.ok(sidebar.includes(`<Dialog.${primitive}`), primitive);
    }
    assert.match(sidebar, /aria-label="Close navigation"/);
    assert.match(sidebar, /LifeOS navigation/);
    assert.match(sidebar, /desktop.addEventListener\("change", closeOnDesktop\)/);
    assert.match(sidebar, /desktop.removeEventListener\("change", closeOnDesktop\)/);
    assert.match(sidebar, /group flex h-11 lg:h-9/);
    assert.doesNotMatch(sidebar, /-translate-x-full/);
});

test("mobile expenses keep readable records and actions rather than compressing the desktop table", () => {
    const source = readFileSync(new URL("features/finance/components/expenses/expenses-table.tsx", root), "utf8");
    assert.match(source, /hidden overflow-x-auto lg:block/);
    assert.match(source, /divide-y divide-border-subtle lg:hidden/);
    assert.match(source, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
    assert.match(source, /break-words text-sm font-medium/);
    assert.match(source, /col-start-1 row-start-2 break-words/);
    assert.match(source, /<ExpenseActions/);
});

test("shared dialogs fit the dynamic viewport and mobile fields retain comfortable touch targets", () => {
    const dialog = readFileSync(new URL("components/ui/dialog/dialog.tsx", root), "utf8");
    const input = readFileSync(new URL("components/ui/input.tsx", root), "utf8");
    assert.ok(dialog.includes("max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain"));
    assert.match(dialog, /aria-label="Close dialog"/);
    assert.match(input, /h-11 sm:h-10/);
    assert.match(input, /text-base sm:text-sm/);
});
