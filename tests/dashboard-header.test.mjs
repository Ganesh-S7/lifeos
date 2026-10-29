import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import {
    formatDashboardDate,
    getDashboardGreeting,
    getDashboardClockSnapshot,
    getServerDashboardClockSnapshot,
    nextDashboardClockChange,
    subscribeDashboardClock,
} from "../src/features/dashboard/utils/dashboard-clock.ts";

const headerUrl = new URL("../src/features/dashboard/components/dashboard-header.tsx", import.meta.url).href;
const clockUrl = new URL("../src/features/dashboard/utils/dashboard-clock.ts", import.meta.url).href;
const key = "lifeos.dashboard-header-tests";
const boundary = { client: false, session: { data: null } };
globalThis[Symbol.for(key)] = boundary;
const ref = `globalThis[Symbol.for(${JSON.stringify(key)})]`;
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (context.parentURL === headerUrl) {
            let source;
            if (specifier === "@/lib/auth-client") {
                source = `export const authClient = { useSession() { return ${ref}.session; } };`;
            } else if (specifier === "./quick-add") {
                source = "export function QuickAdd() { return null; }";
            } else if (specifier === "react") {
                source = `import { useSyncExternalStore as realHook } from 'react';
                    export function useSyncExternalStore(subscribe, snapshot, serverSnapshot) {
                        return ${ref}.client ? snapshot() : realHook(subscribe, snapshot, serverSnapshot);
                    }`;
            } else if (specifier === "../utils/dashboard-clock") {
                return nextResolve(clockUrl, context);
            }
            if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        }
        if (specifier === "react" && context.parentURL?.startsWith("data:")) {
            return nextResolve(specifier, { ...context, parentURL: import.meta.url });
        }
        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (url === headerUrl) {
            return {
                format: "module",
                shortCircuit: true,
                source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
                    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
                }).outputText,
            };
        }
        return nextLoad(url, context);
    },
});
const { DashboardHeader } = await import(headerUrl);
const render = () => renderToStaticMarkup(React.createElement(DashboardHeader));

beforeEach(() => {
    boundary.client = false;
    boundary.session = { data: null };
});

test("greetings cover all local hours and exact boundaries", () => {
    for (const [hour, expected] of [
        [0, "Good evening"], [5, "Good evening"], [6, "Good morning"],
        [11, "Good morning"], [12, "Good afternoon"], [17, "Good afternoon"],
        [18, "Good evening"], [23, "Good evening"],
    ]) {
        assert.equal(getDashboardGreeting(new Date(2026, 9, 28, hour)), expected);
    }
});

test("date labels use local calendar dates across midnight, month and year changes", () => {
    assert.equal(formatDashboardDate(new Date(2026, 9, 28, 23, 59)), "Wednesday, October 28");
    assert.equal(formatDashboardDate(new Date(2026, 9, 29)), "Thursday, October 29");
    assert.equal(formatDashboardDate(new Date(2026, 11, 31)), "Thursday, December 31");
    assert.equal(formatDashboardDate(new Date(2027, 0, 1)), "Friday, January 1");
    const originalTimezone = process.env.TZ;
    try {
        const instant = new Date("2026-10-28T01:00:00Z");
        process.env.TZ = "America/Los_Angeles";
        assert.equal(formatDashboardDate(instant), "Tuesday, October 27");
        assert.equal(getDashboardGreeting(instant), "Good evening");
        process.env.TZ = "Asia/Kolkata";
        assert.equal(formatDashboardDate(instant), "Wednesday, October 28");
        assert.equal(getDashboardGreeting(instant), "Good morning");
    } finally {
        if (originalTimezone === undefined) delete process.env.TZ;
        else process.env.TZ = originalTimezone;
    }
});

test("clock schedules only the next greeting or calendar boundary", () => {
    for (const [hour, expectedHour, expectedDay] of [[0, 6, 28], [6, 12, 28], [12, 18, 28], [18, 0, 29], [23, 0, 29]]) {
        const now = new Date(2026, 9, 28, hour, 15, 45);
        const next = nextDashboardClockChange(now);
        assert.equal(next.getHours(), expectedHour);
        assert.equal(next.getDate(), expectedDay);
        assert.equal(next.getMinutes(), 0);
        assert.equal(next.getSeconds(), 0);
        assert.ok(next > now);
    }
});

test("SSR and first hydration snapshot are neutral, independent of server time or session", () => {
    assert.equal(getServerDashboardClockSnapshot(), null);
    const anonymous = render();
    boundary.session = { data: { user: { id: "one", name: "Server Name" } } };
    assert.equal(render(), anonymous);
    assert.match(anonymous, />Today<\/p>/);
    assert.match(anonymous, />Hello\.<\/h1>/);
    assert.doesNotMatch(anonymous, /Ganesh|October 7|Good morning|Server Name/);
    assert.match(anonymous, /uppercase tracking-\[0\.14em\]/);
});

test("client header follows session changes, trims full names and handles absent names", (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date(2026, 9, 28, 14).getTime() });
    boundary.client = true;
    boundary.session = { data: { user: { id: "one", name: "  Alex Smith  " } } };
    assert.match(render(), /Good afternoon, Alex Smith\./);
    boundary.session = { data: { user: { id: "two", name: "Priya" } } };
    assert.match(render(), /Good afternoon, Priya\./);
    assert.doesNotMatch(render(), /Alex/);
    for (const name of [undefined, null, "", "   "]) {
        boundary.session = { data: { user: { id: "two", name } } };
        assert.match(render(), />Good afternoon\.<\/h1>/);
    }
    boundary.session = { data: null };
    assert.match(render(), />Good afternoon\.<\/h1>/);
});

test("subscription updates at boundaries/midnight, refreshes on return, and cleans up", (t) => {
    t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: new Date(2026, 9, 28, 11, 59, 59).getTime() });
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const windowTarget = new EventTarget();
    const documentTarget = new EventTarget();
    documentTarget.visibilityState = "visible";
    globalThis.window = windowTarget;
    globalThis.document = documentTarget;
    const seen = [];
    const unsubscribe = subscribeDashboardClock(() => seen.push(getDashboardClockSnapshot()));
    try {
        assert.match(seen.at(-1), /Wednesday, October 28\|Good morning/);
        t.mock.timers.tick(1000);
        assert.match(seen.at(-1), /Good afternoon/);
        const count = seen.length;
        t.mock.timers.tick(60_000);
        assert.equal(seen.length, count, "No per-minute polling");
        t.mock.timers.tick(6 * 60 * 60 * 1000 - 60_000);
        assert.match(seen.at(-1), /Good evening/);
        t.mock.timers.tick(6 * 60 * 60 * 1000);
        assert.match(seen.at(-1), /Thursday, October 29\|Good evening/);
        documentTarget.visibilityState = "hidden";
        documentTarget.dispatchEvent(new Event("visibilitychange"));
        const hiddenCount = seen.length;
        t.mock.timers.tick(12 * 60 * 60 * 1000);
        assert.equal(seen.length, hiddenCount, "Hidden tabs do not keep a timer");
        documentTarget.visibilityState = "visible";
        documentTarget.dispatchEvent(new Event("visibilitychange"));
        assert.match(seen.at(-1), /Good afternoon/);
        windowTarget.dispatchEvent(new Event("focus"));
        assert.equal(seen.length, hiddenCount + 2);
        unsubscribe();
        const stoppedCount = seen.length;
        t.mock.timers.tick(24 * 60 * 60 * 1000);
        windowTarget.dispatchEvent(new Event("focus"));
        documentTarget.dispatchEvent(new Event("visibilitychange"));
        assert.equal(seen.length, stoppedCount);
    } finally {
        unsubscribe();
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
});
