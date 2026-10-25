import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { registerHooks } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import { getTodayDateKey } from "../src/features/health/utils/health-calculations.ts";
import { formatDateDisplay } from "../src/lib/utils/date.ts";

const root = new URL("../src/", import.meta.url);
const key = "lifeos.health-dashboard-tests";
const boundary = {};
globalThis[Symbol.for(key)] = boundary;
const ref = `globalThis[Symbol.for(${JSON.stringify(key)})]`;
const stubs = {
    "@/lib/auth-client": `export const authClient = { useSession() { return ${ref}.session; } };`,
    "@/features/health/store/health-store": `
        export function useHealthHydration(userId, pending) { ${ref}.hydration = [userId, pending]; }
        export function useHealthStore() { return ${ref}.health; }
    `,
    "next/link": `import React from 'react'; export default function Link({children, ...props}) {
        return React.createElement('a', props, children);
    }`,
    "@/components/ui": ["card", "stat", "progress", "skeleton", "load-error"].map(
        (name) => `export * from ${JSON.stringify(new URL(`components/ui/${name}.tsx`, root).href)};`,
    ).join("\n"),
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
        if (url.startsWith(root.href) && (
            url.endsWith(".tsx") || url === new URL("features/health/api/health-api.ts", root).href
        )) {
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
const { HealthStats } = await import("../src/features/dashboard/components/health-stats.tsx");
const { HealthOverview } = await import("../src/features/dashboard/components/health-overview.tsx");
const { RecentActivity } = await import("../src/features/dashboard/components/recent-activity.tsx");
const { useDashboardHealth } = await import("../src/features/dashboard/hooks/use-dashboard-health.ts");
const today = getTodayDateKey();
const render = (Component) => renderToStaticMarkup(React.createElement(Component));
const allWidgets = () => [HealthStats, HealthOverview, RecentActivity].map(render).join("\n");
const log = (date, fields = {}) => ({
    id: `log-${date}`, date, createdAt: `${date}T12:00:00Z`, updatedAt: `${date}T12:00:00Z`, ...fields,
});

beforeEach(() => {
    boundary.session = { data: { user: { id: "health-user" } }, isPending: false };
    boundary.health = {
        logs: [], targets: null, ready: true, activeUserId: "health-user", loadError: null,
        async initializeForUser(userId) { boundary.retriedUser = userId; },
    };
    boundary.retriedUser = null;
});

function noFabrication(html) {
    assert.doesNotMatch(html, /72\.4|0\.8 kg down|Habit completion|75%|18 of 24|1,840|2,200|112 g|140 g|7,420|10,000|7h 18m|Weight logged|Habit completed|Workout|5 hours ago|6 hours ago/);
}

test("today's measurements and target progress derive from the shared Health records", () => {
    boundary.health.logs = [
        log("2001-01-01", { caloriesKcal: 999, steps: 999 }),
        log(today, { caloriesKcal: 1650, proteinGrams: 95, steps: 6500, sleepMinutes: 405 }),
    ];
    boundary.health.targets = {
        updatedAt: "test", caloriesKcalPerDay: 2000, proteinGramsPerDay: 125,
        stepsPerDay: 8000, sleepMinutesPerDay: 480,
    };
    const html = render(HealthOverview);
    for (const value of ["1,650 kcal", "95 g", "6,500 steps", "6h 45m", "Target: 2,000 kcal", "Target: 125 g"]) {
        assert.ok(html.includes(value), value);
    }
    for (const percent of [83, 76, 81, 84]) {
        assert.ok(html.includes(`aria-valuenow="${percent}"`));
    }
    noFabrication(html);
    assert.deepEqual(boundary.hydration, ["health-user", false]);
});

test("summary uses latest recorded weight/sleep and actual weight goal, with explicit dates", () => {
    boundary.health.logs = [
        log("2001-01-02", { weightKg: 68.2 }),
        log("2001-01-04", { steps: 42 }),
        log("2001-01-03", { sleepMinutes: 390 }),
        log("2001-01-01", { weightKg: 69 }),
    ];
    boundary.health.targets = { weightGoalKg: 65, updatedAt: "test" };
    const html = render(HealthStats);
    assert.match(html, /68\.2 kg/);
    assert.match(html, /Goal: 65 kg/);
    assert.match(html, /6h 30m/);
    assert.ok(html.includes(formatDateDisplay("2001-01-02")));
    assert.ok(html.includes(formatDateDisplay("2001-01-03")));
    assert.match(render(HealthOverview), /No health measurements recorded today/);
    noFabrication(html);
});

test("empty records show missing summaries, honest empty states and useful Health links", () => {
    const html = allWidgets();
    assert.match(html, /No weight recorded yet/);
    assert.match(html, /No sleep records yet/);
    assert.match(html, /No health measurements recorded today/);
    assert.match(html, /No health activity recorded yet/);
    assert.match(html, /href="\/health"/);
    assert.doesNotMatch(html, /role="progressbar"/);
    noFabrication(html);
});

test("missing fields/targets stay missing while recorded zeroes remain valid", () => {
    boundary.health.logs = [log(today, { steps: 0, proteinGrams: 0 })];
    boundary.health.targets = { stepsPerDay: 5000, caloriesKcalPerDay: 1800, updatedAt: "test" };
    const html = render(HealthOverview);
    assert.match(html, /0 steps/);
    assert.match(html, /0 g/);
    assert.equal((html.match(/Not recorded/g) ?? []).length, 2);
    assert.equal((html.match(/role="progressbar"/g) ?? []).length, 1);
    assert.match(html, /aria-valuenow="0"/);
    assert.match(html, /No target set/);
});

test("loading and session transitions never render cached measurements or fabricated values", () => {
    boundary.health.logs = [log(today, { weightKg: 87.6, steps: 12345 })];
    for (const scenario of ["loading", "other-user", "session-pending", "signed-out"]) {
        boundary.health.ready = scenario !== "loading";
        boundary.health.activeUserId = scenario === "other-user" ? "different-user" : "health-user";
        boundary.session = {
            data: scenario === "signed-out" ? null : { user: { id: "health-user" } },
            isPending: scenario === "session-pending",
        };
        const html = allWidgets();
        assert.match(html, /Loading health statistics/);
        assert.match(html, /Loading today/);
        assert.match(html, /Loading recent health activity/);
        assert.doesNotMatch(html, /87\.6|12,345|Health log recorded/);
        noFabrication(html);
    }
});

test("API failure is nontechnical, exposes no raw message and retries only the signed-in user", () => {
    boundary.health.ready = false;
    boundary.health.loadError = "PRIVATE mysql://secret:secret@invalid/db SQL_STACK";
    const html = allWidgets();
    assert.equal((html.match(/Unable to load your health data/g) ?? []).length, 3);
    assert.match(html, /Retry/);
    assert.doesNotMatch(html, /PRIVATE|SQL_STACK|mysql:|secret/);
    noFabrication(html);
    useDashboardHealth().retry();
    assert.equal(boundary.retriedUser, "health-user");
    boundary.retriedUser = null;
    boundary.session = { data: null, isPending: false };
    useDashboardHealth().retry();
    assert.equal(boundary.retriedUser, null);
});

test("recent activity is the five newest actual logs, with recorded dates and real summaries", () => {
    boundary.health.logs = Array.from({ length: 7 }, (_, index) => log(`2001-01-0${index + 1}`, { steps: index + 1 }));
    const html = render(RecentActivity);
    assert.equal((html.match(/Health log recorded/g) ?? []).length, 5);
    assert.ok(html.indexOf('dateTime="2001-01-07"') < html.indexOf('dateTime="2001-01-03"'));
    assert.doesNotMatch(html, /dateTime="2001-01-01"|dateTime="2001-01-02"/);
    assert.match(html, /Steps: 7/);
    noFabrication(html);
});

test("all Overview health widgets use shared semantic surfaces and readable text tokens", () => {
    const html = allWidgets();
    assert.match(html, /bg-surface/);
    assert.match(html, /text-text-primary/);
    assert.match(html, /text-text-secondary/);
    assert.doesNotMatch(html, /bg-white|text-black|#[0-9a-f]{6}/i);
    for (const name of ["health-overview", "health-stats", "recent-activity"]) {
        const source = readFileSync(new URL(`features/dashboard/components/${name}.tsx`, root), "utf8");
        assert.doesNotMatch(source, /dark:|#[0-9a-f]{6}/i);
    }
});

test("existing Health API/store initializes once and saved measurements feed Overview", async (t) => {
    const { useHealthStore } = await import("../src/features/health/store/health-store.ts");
    useHealthStore.getState().resetForSignedOut();
    let requests = 0;
    let saved = log(today, { steps: 2100, weightKg: 67.8 });
    t.mock.method(globalThis, "fetch", async (url, options) => {
        requests++;
        if (url === "/api/health") {
            assert.equal(options.cache, "no-store");
            return Response.json({ logs: [saved], targets: null });
        }
        assert.equal(url, "/api/health/logs");
        assert.equal(options.method, "POST");
        saved = { ...saved, ...JSON.parse(options.body) };
        return Response.json({ log: saved });
    });
    try {
        await Promise.all([
            useHealthStore.getState().initializeForUser("health-user"),
            useHealthStore.getState().initializeForUser("health-user"),
        ]);
        assert.equal(requests, 1);
        boundary.health = useHealthStore.getState();
        assert.match(render(HealthStats), /67\.8 kg/);
        assert.match(render(HealthOverview), /2,100 steps/);
        await useHealthStore.getState().saveLog({ date: today, steps: 2250 });
        boundary.health = useHealthStore.getState();
        assert.match(render(HealthOverview), /2,250 steps/);
        assert.doesNotMatch(render(HealthOverview), /2,100 steps/);
        assert.equal(requests, 2);
    } finally {
        useHealthStore.getState().resetForSignedOut();
    }
});

test("actual API failure leaves no mock or stale records in the Health store or Overview", async (t) => {
    const { useHealthStore } = await import("../src/features/health/store/health-store.ts");
    useHealthStore.getState().resetForSignedOut();
    t.mock.method(globalThis, "fetch", async () => Response.json({ message: "PRIVATE_ERROR_DETAIL" }, { status: 503 }));
    try {
        await useHealthStore.getState().initializeForUser("health-user");
        boundary.health = useHealthStore.getState();
        assert.equal(boundary.health.ready, false);
        assert.deepEqual(boundary.health.logs, []);
        assert.equal(boundary.health.targets, null);
        const html = allWidgets();
        assert.match(html, /Unable to load your health data/);
        assert.doesNotMatch(html, /PRIVATE_ERROR_DETAIL/);
        noFabrication(html);
    } finally {
        useHealthStore.getState().resetForSignedOut();
    }
});
