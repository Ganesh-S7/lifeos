import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { registerHooks } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import React from "react";
import ts from "typescript";

const root = new URL("../src/", import.meta.url);
const reactUrl = import.meta.resolve("react");
const formUrl = import.meta.resolve("react-hook-form");
const key = "lifeos.expense-form-test";
const state = {};
globalThis[Symbol.for(key)] = state;
const ref = `globalThis[Symbol.for(${JSON.stringify(key)})]`;
const frames = new Map();
let frame;
state.hooks = {
    useState(initial) {
        const owner = frame;
        const index = owner.index++;
        if (!(index in owner.values)) owner.values[index] = typeof initial === "function" ? initial() : initial;
        return [owner.values[index], (next) => {
            owner.values[index] = typeof next === "function" ? next(owner.values[index]) : next;
        }];
    },
    useRef(initial) { return state.hooks.useState(() => ({ current: initial }))[0]; },
    useId() { return "expense-category-test"; },
    useEffect(setup, deps) {
        const index = frame.index++;
        if (!frame.deps[index] || deps.some((dep, at) => dep !== frame.deps[index][at])) frame.effects.push(setup);
        frame.deps[index] = deps;
    },
};
state.useForm = (options) => {
    const owner = frame;
    if (!owner.form) {
        const form = { values: { ...options.defaultValues }, dirty: {} };
        form.methods = {
            control: {},
            register: (name) => ({ name }),
            formState: { errors: {}, isSubmitting: false },
            reset(values = options.defaultValues) { form.values = { ...values }; form.dirty = {}; },
            setValue(name, value, settings = {}) { form.values[name] = value; if (settings.shouldDirty) form.dirty[name] = true; },
            getValues(name) { return form.values[name]; },
            getFieldState(name) { return { isDirty: Boolean(form.dirty[name]) }; },
            handleSubmit: (submit) => async () => {
                const { expenseSchema } = await import("../src/features/finance/schemas/expense-schema.ts");
                const result = expenseSchema.safeParse(form.values);
                if (result.success) return submit(result.data);
            },
        };
        owner.form = form;
    }
    return owner.form.methods;
};
const ui = ["Button", "DatePicker", "Dialog", "DialogContent", "DialogDescription", "DialogFooter", "DialogHeader", "DialogTitle", "Input", "Select"];
const stubs = {
    "@/components/ui": `import React from 'react'; ${ui.map((name) => `export function ${name}({children}) { return React.createElement('div', null, children); }`).join("\n")}`,
    "next/link": `export default function Link() { return null; }`,
    "react-hook-form": `export * from ${JSON.stringify(formUrl)}; export function useForm(options) { return ${ref}.useForm(options); } export function Controller() { return null; }`,
    "@/features/finance/store/finance-store": `export function useFinance() { return ${ref}.finance; } export const financeActions = {
        loadCategories: (...args) => ${ref}.loadCategories(...args),
        createCategory: (...args) => ${ref}.createCategory(...args),
    };`,
};
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "react" && context.parentURL?.startsWith(root.href)) {
            const source = `export * from ${JSON.stringify(reactUrl)};
                export const {useState, useRef, useEffect, useId} = ${ref}.hooks;`;
            return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        }
        if (specifier === "react" && context.parentURL?.startsWith("data:")) return nextResolve(reactUrl, context);
        if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
        const file = specifier.startsWith("@/") ? new URL(specifier.slice(2), root)
            : specifier.startsWith(".") && context.parentURL?.startsWith(root.href) ? new URL(specifier, context.parentURL) : null;
        if (file) {
            const alias = "@/" + file.href.slice(root.href.length);
            if (stubs[alias]) return { url: `data:text/javascript,${encodeURIComponent(stubs[alias])}`, shortCircuit: true };
            for (const extension of [".ts", ".tsx"]) if (existsSync(new URL(file.href + extension))) return nextResolve(file.href + extension, context);
        }
        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (url.startsWith(root.href) && url.endsWith(".tsx")) {
            return { format: "module", shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
                compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
            }).outputText };
        }
        return nextLoad(url, context);
    },
});
const { AddExpenseDialog } = await import("../src/features/finance/components/expenses/add-expense-dialog.tsx");
const { ExpenseCategoryCombobox } = await import("../src/features/finance/components/expenses/expense-category-combobox.tsx");
function render(Component, props) {
    if (!frames.has(Component)) frames.set(Component, { values: [], deps: [], index: 0, effects: [] });
    frame = frames.get(Component);
    frame.index = 0;
    const tree = Component(props);
    const effects = frame.effects.splice(0);
    effects.forEach((setup) => setup());
    return tree;
}
function nodes(tree) {
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    return React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}
function find(tree, predicate) {
    const result = nodes(tree).find(predicate);
    assert.ok(result, "Expected element was rendered");
    return result;
}
const input = (tree) => find(tree, (node) => node.props.role === "combobox");
const tick = () => new Promise((resolve) => setImmediate(resolve));
beforeEach(() => {
    frames.clear();
    state.finance = {
        ready: true, userId: "user-a", categoriesReady: true, categoriesLoading: false, categoriesError: "",
        categories: [{ id: null, name: "Food", builtIn: true }, { id: null, name: "Shopping", builtIn: true }],
    };
    state.createCalls = 0;
    state.loadCategories = async () => {};
    state.createCategory = async (name) => { state.createCalls++; return { id: "saved", name, builtIn: false }; };
});

test("new form has no arbitrary category; late accounts fill only an untouched account and edit preserves fields", () => {
    const props = { open: true, accounts: [], onOpenChange() {}, async onSubmit() {} };
    render(AddExpenseDialog, props);
    const form = frames.get(AddExpenseDialog).form;
    assert.equal(form.values.category, "");
    assert.equal(form.values.account, "");
    const accounts = [{ label: "Everyday", value: "a" }, { label: "Savings", value: "b" }];
    render(AddExpenseDialog, { ...props, accounts });
    assert.equal(form.values.account, "a");
    form.methods.setValue("account", "b", { shouldDirty: true });
    render(AddExpenseDialog, { ...props, accounts: [...accounts] });
    assert.equal(form.values.account, "b");
    render(AddExpenseDialog, { ...props, accounts, expense: { amount: 12, merchant: "Local stall", category: "Legacy food", account: "b", date: "2026-10-20", note: "Dosa" } });
    assert.equal(form.values.category, "Legacy food");
    assert.equal(form.values.account, "b");
    assert.equal(form.values.merchant, "Local stall");
    assert.equal(form.values.note, "Dosa");
});

test("empty account form explains next step, prevents saving and clarifies Merchant and Note", () => {
    const tree = render(AddExpenseDialog, { open: true, accounts: [], onOpenChange() {}, async onSubmit() {} });
    assert.ok(find(tree, (node) => node.props.type === "submit").props.disabled);
    assert.ok(find(tree, (node) => node.props.href === "/finance"));
    assert.equal(find(tree, (node) => node.props.id === "merchant").props["aria-describedby"], "merchant-help");
    assert.equal(find(tree, (node) => node.props.id === "note").props.placeholder, "e.g. milk, dosa and coffee");
});

test("search selects existing categories and equivalent names do not offer creation", () => {
    let chosen;
    const props = { value: "", onChange(value) { chosen = value; }, onBusyChange() {} };
    let tree = render(ExpenseCategoryCombobox, props);
    input(tree).props.onFocus();
    tree = render(ExpenseCategoryCombobox, props);
    input(tree).props.onChange({ target: { value: " FOOD " } });
    tree = render(ExpenseCategoryCombobox, props);
    const options = nodes(tree).filter((node) => node.props.role === "option");
    assert.equal(options.length, 1);
    options[0].props.onClick();
    assert.equal(chosen, "Food");
    assert.equal(state.createCalls, 0);
});

test("explicit create persists once, selects the response and blocks duplicate submissions", async () => {
    let chosen;
    const busy = [];
    const props = { value: "", onChange(value) { chosen = value; }, onBusyChange(value) { busy.push(value); } };
    let tree = render(ExpenseCategoryCombobox, props);
    input(tree).props.onFocus();
    input(render(ExpenseCategoryCombobox, props)).props.onChange({ target: { value: " Groceries " } });
    tree = render(ExpenseCategoryCombobox, props);
    const create = find(tree, (node) => node.props.role === "option");
    create.props.onClick();
    create.props.onClick();
    await tick();
    assert.equal(state.createCalls, 1);
    assert.equal(chosen, "Groceries");
    assert.deepEqual(busy, [true, false]);
});

test("keyboard selection and Escape work without submitting or closing the expense dialog", () => {
    let chosen;
    const props = { value: "Shopping", onChange(value) { chosen = value; }, onBusyChange() {} };
    let tree = render(ExpenseCategoryCombobox, props);
    input(tree).props.onFocus();
    tree = render(ExpenseCategoryCombobox, props);
    let prevented = false;
    input(tree).props.onKeyDown({ key: "Enter", preventDefault() { prevented = true; } });
    assert.equal(chosen, "Food");
    assert.equal(prevented, true);
    input(render(ExpenseCategoryCombobox, props)).props.onFocus();
    tree = render(ExpenseCategoryCombobox, props);
    let stopped = false;
    input(tree).props.onKeyDown({ key: "Escape", preventDefault() {}, stopPropagation() { stopped = true; } });
    assert.equal(stopped, true);
    assert.equal(input(render(ExpenseCategoryCombobox, props)).props["aria-expanded"], false);
});

test("category failures retain the form selection and expose retryable feedback", async () => {
    state.createCategory = async () => { throw new Error("Unable to create this category."); };
    const props = { value: "Food", onChange() { assert.fail("Failed create must not select"); }, onBusyChange() {} };
    input(render(ExpenseCategoryCombobox, props)).props.onFocus();
    input(render(ExpenseCategoryCombobox, props)).props.onChange({ target: { value: "Groceries" } });
    find(render(ExpenseCategoryCombobox, props), (node) => node.props.role === "option").props.onClick();
    await tick();
    const tree = render(ExpenseCategoryCombobox, props);
    assert.match(find(tree, (node) => node.props.role === "alert").props.children, /Unable to create/);
});

test("loading and failed category reads prevent create and retain an explicit retry", () => {
    const props = { value: "", onChange() {}, onBusyChange() {} };
    state.finance.categoriesReady = false;
    state.finance.categoriesLoading = true;
    input(render(ExpenseCategoryCombobox, props)).props.onFocus();
    input(render(ExpenseCategoryCombobox, props)).props.onChange({ target: { value: "Groceries" } });
    let tree = render(ExpenseCategoryCombobox, props);
    assert.equal(nodes(tree).filter((node) => node.props.role === "option").length, 0);
    state.finance.categoriesLoading = false;
    state.finance.categoriesError = "Unable to load categories.";
    let forced;
    state.loadCategories = (force) => { forced = force; };
    tree = render(ExpenseCategoryCombobox, props);
    assert.equal(find(tree, (node) => node.props.role === "alert").props.children, state.finance.categoriesError);
    find(tree, (node) => node.type === "button").props.onClick();
    assert.equal(forced, true);
    assert.equal(state.createCalls, 0);
});
