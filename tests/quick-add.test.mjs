import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

// Execute the real component handlers and validators with a small hook/form
// harness. Radix keyboard navigation, portals and focus need browser review.
const root = new URL("../src/", import.meta.url);
const reactUrl = import.meta.resolve("react");
const formUrl = import.meta.resolve("react-hook-form");
const originalAnimationFrame = globalThis.requestAnimationFrame;
globalThis.requestAnimationFrame = (callback) => callback();
after(() => {
    if (originalAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = originalAnimationFrame;
});
const key = "lifeos.quick-add-tests";
const boundary = {};
globalThis[Symbol.for(key)] = boundary;
const ref = `globalThis[Symbol.for(${JSON.stringify(key)})]`;
const frames = new Map();
let frame;

boundary.hooks = {
    useState(initial) {
        const owner = frame;
        const index = owner.index++;
        if (!(index in owner.values)) owner.values[index] = typeof initial === "function" ? initial() : initial;
        return [owner.values[index], (next) => {
            owner.values[index] = typeof next === "function" ? next(owner.values[index]) : next;
        }];
    },
    useRef(initial) {
        return boundary.hooks.useState(() => ({ current: initial }))[0];
    },
    useMemo(create) { return create(); },
    useEffect() {},
};
boundary.useForm = (options) => {
    const owner = frame;
    owner.form ??= { values: options.defaultValues, errors: {} };
    const form = owner.form;
    return {
        register: (name) => ({ name }),
        control: {},
        formState: { errors: form.errors, isSubmitting: false },
        reset(values = options.defaultValues) { form.values = values; },
        clearErrors() { form.errors = {}; },
        setError(name, error) { form.errors[name] = error; },
        setValue(name, value) { form.values[name] = value; },
        handleSubmit: (submit) => async (values = form.values) => {
            const result = await options.resolver(values, undefined, {
                criteriaMode: "firstError", shouldUseNativeValidation: false, fields: {},
            });
            form.errors = result.errors;
            if (Object.keys(result.errors).length === 0) return submit(result.values);
        },
    };
};

const uiNames = [
    "Button", "Dialog", "DialogContent", "DialogDescription", "DialogFooter", "DialogHeader", "DialogTitle",
    "DropdownMenu", "DropdownMenuContent", "DropdownMenuItem", "DropdownMenuTrigger", "DatePicker", "Input", "Select",
    "LoadError", "Skeleton", "SkeletonRegion", "Card", "InfoTooltip",
];
const stubs = {
    "@/features/finance/store/finance-store": `
        export function useFinance() { return { ...${ref}.finance.getSnapshot(), retry: ${ref}.retryFinance }; }
        export const financeActions = { saveTransaction: (input) => ${ref}.finance.actions.saveTransaction(input) };
    `,
    "@/features/health/store/health-store": `
        export function useHealthHydration() {}
        export function useHealthStore(selector) {
            const state = ${ref}.health.getState();
            return selector ? selector(state) : state;
        }
        useHealthStore.getState = () => ${ref}.health.getState();
    `,
    "@/lib/auth-client": `export const authClient = {
        useSession() { return { data: { user: { id: 'user' } }, isPending: false }; }
    };`,
    "@/lib/notifications": `export const notify = {
        success: (message) => ${ref}.feedback.push(['success', message]),
        error: (message) => ${ref}.feedback.push(['error', message]),
    };`,
    "react-hook-form": `export * from ${JSON.stringify(formUrl)};
        export function useForm(options) { return ${ref}.useForm(options); }
        export function useWatch({name, defaultValue}) { return ${ref}.watch(name, defaultValue); }
        export function Controller() { return null; }
    `,
    "next/link": `import React from 'react'; export default function Link({children, ...props}) {
        return React.createElement('a', props, children);
    }`,
    "@/components/ui": `import React from 'react';
        ${uiNames.map((name) => `export function ${name}({children}) { return React.createElement('div', null, children); }`).join("\n")}
        export function Stat({label, value, description, footer}) {
            return React.createElement('article', null, label, ' ', value, ' ', description, footer);
        }
    `,
};
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "react" && context.parentURL?.startsWith(root.href)) {
            const source = `export * from ${JSON.stringify(reactUrl)};
                export {default} from ${JSON.stringify(reactUrl)};
                export const {useState, useRef, useMemo, useEffect} = ${ref}.hooks;`;
            return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        }
        if (specifier === "react" && context.parentURL?.startsWith("data:")) {
            return nextResolve(reactUrl, context);
        }
        if (stubs[specifier]) {
            return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
        }
        // Relative imports inside the reused dialogs must hit the same shared boundary.
        const file = specifier.startsWith("@/")
            ? new URL(specifier.slice(2), root)
            : specifier.startsWith(".") && context.parentURL?.startsWith(root.href)
                ? new URL(specifier, context.parentURL)
                : null;
        if (file) {
            const alias = "@/" + file.href.slice(root.href.length);
            if (stubs[alias]) return { url: `data:text/javascript,${encodeURIComponent(stubs[alias])}`, shortCircuit: true };
            for (const extension of [".ts", ".tsx"]) {
                if (existsSync(new URL(file.href + extension))) return nextResolve(file.href + extension, context);
            }
        }
        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (url.startsWith(root.href) && (url.endsWith(".tsx") || url.endsWith("/health-api.ts"))) {
            const source = ts.transpileModule(readFileSync(new URL(url), "utf8"), {
                compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
            }).outputText;
            return { format: "module", source, shortCircuit: true };
        }
        return nextLoad(url, context);
    },
});
boundary.watch = (name, fallback) => frame.form?.values[name] ?? fallback;
const { QuickAdd } = await import("../src/features/dashboard/components/quick-add.tsx");
const { FinanceManager } = await import("../src/features/finance/components/overview/finance-manager.tsx");
const { AddExpenseDialog } = await import("../src/features/finance/components/expenses/add-expense-dialog.tsx");
const { HealthLogDialog } = await import("../src/features/health/components/health-log-dialog.tsx");
const { OverviewStats } = await import("../src/features/dashboard/components/overview-stats.tsx");
const { RecentActivity } = await import("../src/features/dashboard/components/recent-activity.tsx");
const { createFinanceStore, emptyFinanceData } = await import("../src/features/finance/store/finance-store-core.ts");
// Explicit extension bypasses the UI alias boundary: this is the actual store.
const { useHealthStore } = await import("../src/features/health/store/health-store.ts");
const { formatDateValue } = await import("../src/lib/utils/date.ts");
const today = formatDateValue(new Date());
const timestamp = new Date().toISOString();

function render(Component, props = {}) {
    if (!frames.has(Component)) frames.set(Component, { values: [], index: 0 });
    frame = frames.get(Component);
    frame.index = 0;
    return Component(props);
}
function nodes(tree) {
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    if (!React.isValidElement(tree)) return [];
    return [tree, ...nodes(tree.props.children)];
}
function find(tree, name) {
    const found = nodes(tree).find((node) => typeof name === "string"
        ? node.type === name || node.type.name === name
        : node.type === name);
    assert.ok(found, `Missing ${typeof name === "string" ? name : name.name}`);
    return found;
}
const text = (node) => renderToStaticMarkup(node);
const content = () => render(QuickAdd).type;
function select(Component, label) {
    const menu = render(Component);
    const item = nodes(menu).find((node) => node.type.name === "DropdownMenuItem" && text(node).includes(label));
    assert.ok(item && !item.props.disabled, label);
    item.props.onSelect();
    return render(Component);
}
const submit = (tree, values) => find(tree, "form").props.onSubmit(values);
const tick = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(async () => {
    frames.clear();
    boundary.feedback = [];
    boundary.reject = null;
    boundary.block = null;
    boundary.calls = [];
    boundary.retryFinance = () => { boundary.retries++; };
    boundary.retries = 0;
    let database = {
        ...emptyFinanceData(),
        accounts: [{
            id: "bank", name: "Everyday", balanceSnapshot: 1000,
            balanceSnapshotAt: "2000-01-01T00:00:00Z", createdAt: timestamp, updatedAt: timestamp,
        }],
    };
    boundary.finance = createFinanceStore({
        async getFinanceData() { return database; },
        async createTransaction(body) {
            boundary.calls.push(body);
            if (boundary.block) await boundary.block;
            if (boundary.reject) throw new Error(boundary.reject);
            const record = { id: `tx-${boundary.calls.length}`, recordedAt: timestamp, ...body };
            database = { ...database, transactions: [...database.transactions, record] };
            return record;
        },
    });
    await boundary.finance.setSession("user");
    boundary.health = useHealthStore;
    useHealthStore.getState().resetForSignedOut();
    useHealthStore.setState({ activeUserId: "user", ready: true });
});

test("Quick Add menu opens, closes, lists all actions and restores trigger focus", (t) => {
    t.mock.method(globalThis, "requestAnimationFrame", (callback) => callback(), { create: true });
    const Component = content();
    let tree = render(Component);
    assert.equal(find(tree, "DropdownMenu").props.open, false);
    find(tree, "DropdownMenu").props.onOpenChange(true);
    tree = render(Component);
    assert.equal(find(tree, "DropdownMenu").props.open, true);
    for (const label of ["Add Income", "Add Expense", "Log Health"]) assert.ok(text(tree).includes(label));
    find(tree, "DropdownMenu").props.onOpenChange(false);
    assert.equal(find(render(Component), "DropdownMenu").props.open, false);
    let focused = false;
    const trigger = find(render(Component), "Button").props.ref;
    trigger.current = { focus() { focused = true; } };
    tree = select(Component, "Add Income");
    assert.equal(find(tree, "DropdownMenu").props.open, false);
    const workflow = find(tree, FinanceManager);
    assert.equal(workflow.props.kind, "transaction");
    let prevented = false;
    find(tree, "DropdownMenuContent").props.onCloseAutoFocus({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    workflow.props.onClose();
    assert.equal(focused, true);
    assert.equal(nodes(render(Component)).some((node) => node.type === FinanceManager), false);
});

test("actions reuse the existing forms; cancel, Escape/close and reopening clear the selection", (t) => {
    t.mock.method(globalThis, "requestAnimationFrame", (callback) => callback(), { create: true });
    const Component = content();
    for (const [label, Form] of [["Add Income", FinanceManager], ["Add Expense", AddExpenseDialog], ["Log Health", HealthLogDialog]]) {
        const workflow = find(select(Component, label), Form);
        const dialog = render(Form, workflow.props);
        const cancel = nodes(dialog).find((node) => node.type.name === "Button" && text(node).includes("Cancel"));
        assert.ok(cancel);
        cancel.props.onClick();
        assert.equal(nodes(render(Component)).some((node) => node.type === Form), false);
        const reopened = find(select(Component, label), Form);
        find(render(Form, reopened.props), "Dialog").props.onOpenChange(false);
        assert.equal(nodes(render(Component)).some((node) => node.type === Form), false);
        frames.delete(Form);
    }
});

test("unready data disables the relevant actions; failures offer retry without raw errors", () => {
    boundary.finance = { getSnapshot: () => ({ data: emptyFinanceData(), ready: false, loadError: "PRIVATE_ERROR" }) };
    useHealthStore.setState({ ready: false, loadError: "PRIVATE_ERROR" });
    const tree = render(content());
    const items = nodes(tree).filter((node) => node.type.name === "DropdownMenuItem");
    assert.equal(items.filter((node) => node.props.disabled).length, 3);
    assert.doesNotMatch(text(tree), /PRIVATE_ERROR/);
    items.find((node) => text(node).includes("Retry Finance")).props.onSelect();
    assert.equal(boundary.retries, 1);
});

test("missing accounts explain the prerequisite and link to Finance instead of opening an invalid form", () => {
    boundary.finance = { getSnapshot: () => ({ userId: "user", ready: true, data: emptyFinanceData() }) };
    const Component = content();
    for (const label of ["Add Income", "Add Expense"]) {
        const tree = select(Component, label);
        assert.equal(find(tree, "Dialog").props.open, true);
        assert.match(text(tree), /Add a bank account first/);
        assert.ok(nodes(tree).some((node) => node.props.href === "/finance"));
        assert.equal(nodes(tree).some((node) => node.type === FinanceManager || node.type === AddExpenseDialog), false);
    }
});

test("income and expense save through the real shared store, update Overview and survive a reload", async (t) => {
    t.mock.method(globalThis, "requestAnimationFrame", (callback) => callback(), { create: true });
    const Component = content();
    let workflow = find(select(Component, "Add Income"), FinanceManager);
    let dialog = render(FinanceManager, workflow.props);
    assert.equal(frames.get(FinanceManager).form.values.type, "income");
    await submit(dialog, {
        ...frames.get(FinanceManager).form.values, name: "Salary", amount: "600", accountId: "bank", date: today,
    });
    assert.equal(boundary.calls[0].type, "income");
    assert.deepEqual(boundary.feedback, [["success", "Transaction saved."]]);
    assert.equal(nodes(render(Component)).some((node) => node.type === FinanceManager), false);
    workflow = find(select(Component, "Add Expense"), AddExpenseDialog);
    assert.deepEqual(workflow.props.accounts, [{ label: "Everyday", value: "bank" }]);
    dialog = render(AddExpenseDialog, workflow.props);
    await submit(dialog, { amount: 75, merchant: "Lunch", category: "Food", account: "bank", date: new Date(), note: "" });
    assert.equal(boundary.calls[1].type, "expense");
    assert.equal(boundary.calls[1].accountId, "bank");
    assert.deepEqual(boundary.feedback.at(-1), ["success", "Expense saved."]);
    const html = text(React.createElement(OverviewStats));
    assert.match(html, /525/);
    assert.match(html, /75/);
    await boundary.finance.retry();
    assert.equal(boundary.finance.getSnapshot().data.transactions.length, 2);
});

test("existing Finance validation prevents writes; server errors keep the form open without success", async () => {
    const Component = content();
    for (const [label, Form, invalid, valid] of [
        ["Add Income", FinanceManager, { name: "", amount: "0" }, { name: "Salary", amount: "100" }],
        ["Add Expense", AddExpenseDialog, { amount: -1, merchant: "" }, { amount: 20, merchant: "Lunch" }],
    ]) {
        const workflow = find(select(Component, label), Form);
        const dialog = render(Form, workflow.props);
        const defaults = Form === FinanceManager ? frames.get(Form).form.values
            : { category: "Food", account: "bank", date: new Date(), note: "" };
        await submit(dialog, { ...defaults, ...invalid });
        assert.ok(Object.keys(frames.get(Form).form.errors).length > 0);
        assert.equal(boundary.calls.length, 0);
        boundary.reject = "Not enough funds. Please refresh.";
        await submit(dialog, { ...defaults, ...valid });
        assert.equal(find(render(Component), Form).type, Form);
        assert.equal(boundary.feedback.at(-1)[0], "error");
        assert.equal(boundary.feedback.some(([kind]) => kind === "success"), false);
        assert.equal(boundary.finance.getSnapshot().data.transactions.length, 0);
        boundary.calls = [];
    }
});

test("Finance dialogs block duplicate submits and closing during an in-flight save", async (t) => {
    t.mock.method(globalThis, "requestAnimationFrame", (callback) => callback(), { create: true });
    const Component = content();
    for (const [label, Form] of [["Add Income", FinanceManager], ["Add Expense", AddExpenseDialog]]) {
        let release;
        boundary.block = new Promise((resolve) => { release = resolve; });
        const workflow = find(select(Component, label), Form);
        const dialog = render(Form, workflow.props);
        const values = Form === FinanceManager
            ? { ...frames.get(Form).form.values, name: "Salary", amount: "100" }
            : { amount: 20, merchant: "Lunch", category: "Food", account: "bank", date: new Date(), note: "" };
        const first = submit(dialog, values);
        await submit(dialog, values);
        await tick();
        assert.equal(boundary.calls.length, 1);
        find(dialog, "Dialog").props.onOpenChange(false);
        assert.ok(find(render(Component), Form));
        release();
        await first;
        assert.equal(boundary.feedback.filter(([kind]) => kind === "success").length, 1);
        boundary.calls = [];
        boundary.feedback = [];
    }
});

test("Health reuses validation, prevents duplicates, updates Overview activity and persists via its API", async (t) => {
    t.mock.method(globalThis, "requestAnimationFrame", (callback) => callback(), { create: true });
    let release;
    let saved;
    let calls = 0;
    const waiting = new Promise((resolve) => { release = resolve; });
    t.mock.method(globalThis, "fetch", async (url, options) => {
        if (url === "/api/health") return Response.json({ logs: saved ? [saved] : [], targets: null });
        calls++;
        assert.equal(url, "/api/health/logs");
        assert.equal(options.method, "POST");
        await waiting;
        saved = { id: "log", ...JSON.parse(options.body), createdAt: timestamp, updatedAt: timestamp };
        return Response.json({ log: saved });
    });
    const Component = content();
    const workflow = find(select(Component, "Log Health"), HealthLogDialog);
    const dialog = render(HealthLogDialog, workflow.props);
    const values = { ...frames.get(HealthLogDialog).form.values, date: today, steps: "-1" };
    await submit(dialog, values);
    assert.ok(Object.keys(frames.get(HealthLogDialog).form.errors).length > 0);
    assert.equal(calls, 0);
    values.steps = "3210";
    const first = submit(dialog, values);
    await submit(dialog, values);
    assert.equal(calls, 1);
    find(dialog, "Dialog").props.onOpenChange(false);
    assert.ok(find(render(Component), HealthLogDialog));
    release();
    await first;
    assert.deepEqual(boundary.feedback, [["success", "Health log saved."]]);
    assert.equal(nodes(render(Component)).some((node) => node.type === HealthLogDialog), false);
    assert.match(text(React.createElement(RecentActivity)), /Steps: 3,210/);
    useHealthStore.getState().resetForSignedOut();
    await useHealthStore.getState().initializeForUser("user");
    assert.equal(useHealthStore.getState().logs[0].steps, 3210);
});

test("Health API failure retains the dialog, reports failure and releases the submission lock for retry", async (t) => {
    t.mock.method(globalThis, "fetch", async () => Response.json({}, { status: 503 }));
    const Component = content();
    const workflow = find(select(Component, "Log Health"), HealthLogDialog);
    const dialog = render(HealthLogDialog, workflow.props);
    const values = { ...frames.get(HealthLogDialog).form.values, date: today, steps: "50" };
    await submit(dialog, values);
    assert.equal(boundary.feedback.at(-1)[0], "error");
    assert.ok(frames.get(HealthLogDialog).form.errors["root.server"]);
    assert.ok(find(render(Component), HealthLogDialog));
    await submit(dialog, values);
    assert.equal(boundary.feedback.length, 2);
    assert.equal(boundary.feedback.some(([kind]) => kind === "success"), false);
    assert.deepEqual(useHealthStore.getState().logs, []);
});

test("Quick Add uses shared theme primitives and resets dialog identity on user changes", () => {
    const source = readFileSync(new URL("features/dashboard/components/quick-add.tsx", root), "utf8");
    assert.doesNotMatch(source, /#[0-9a-f]{6}|bg-white|text-black|dark:/i);
    assert.match(source, /DropdownMenuTrigger asChild/);
    assert.match(source, /text-text-secondary/);
    assert.equal(render(QuickAdd).key, "user");
    boundary.finance = { getSnapshot: () => ({ userId: "different-user" }) };
    assert.equal(render(QuickAdd).key, "different-user");
});
