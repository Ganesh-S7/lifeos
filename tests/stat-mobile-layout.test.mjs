import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = new URL("../src/", import.meta.url);
registerHooks({
    resolve(specifier, context, nextResolve) {
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
            return {
                format: "module",
                shortCircuit: true,
                source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
                    compilerOptions: {
                        jsx: ts.JsxEmit.ReactJSX,
                        module: ts.ModuleKind.ESNext,
                    },
                }).outputText,
            };
        }
        return nextLoad(url, context);
    },
});

const { Stat } = await import("../src/components/ui/stat.tsx");
const { FinanceComparison } = await import(
    "../src/features/finance/components/overview/finance-comparison.tsx"
);
const render = props => renderToStaticMarkup(React.createElement(Stat, props));
const withoutClasses = html => html.replace(/ class="[^"]*"/g, "");

test("balanced spacing is opt-in and leaves existing Stat consumers unchanged", () => {
    const props = { label: "Income", value: "₹0", compactMobile: true };
    assert.equal(render(props), render({ ...props, balanceMobileContent: false }));
    assert.equal(
        render({ ...props, compactMobile: false }),
        render({ ...props, compactMobile: false, balanceMobileContent: true }),
    );
});

test("mobile balancing preserves values, supporting content, comparison semantics and actions", () => {
    for (const comparison of [
        { available: false, reason: "No previous month snapshot" },
        { available: true, direction: "unchanged" },
        {
            available: true,
            direction: "up",
            tone: "positive",
            absoluteChange: 100,
            percentage: 10,
        },
    ]) {
        for (const action of [
            undefined,
            React.createElement("button", { type: "button" }, "View accounts"),
        ]) {
            const props = {
                label: "Bank balance",
                value: "₹1,100",
                description: "Across 2 bank accounts",
                compactMobile: true,
                footer: React.createElement(FinanceComparison, {
                    comparison,
                    period: "since last month",
                }),
                action,
            };
            const original = render(props);
            const balanced = render({ ...props, balanceMobileContent: true });
            assert.equal(withoutClasses(balanced), withoutClasses(original));
            assert.equal(
                (balanced.match(/since last month/g) ?? []).length,
                comparison.available ? 1 : 0,
            );
        }
    }
});
