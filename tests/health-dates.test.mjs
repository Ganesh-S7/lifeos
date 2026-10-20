import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const timeZones = {
    UTC: 0,
    "Asia/Kolkata": -330,
    "America/Los_Angeles": 420,
    "Pacific/Honolulu": 600,
};

if (process.env.LIFEOS_HEALTH_DATE_TEST_CHILD !== "1") {
    for (const timeZone of Object.keys(timeZones)) {
        test(`Health API date round trips and local calendar behavior under ${timeZone}`, () => {
            const env = {
                ...process.env,
                TZ: timeZone,
                LIFEOS_HEALTH_DATE_TEST_CHILD: "1",
            };
            // A fresh runner must not inherit the parent's internal test IPC mode.
            delete env.NODE_TEST_CONTEXT;

            const result = spawnSync(
                process.execPath,
                ["--experimental-transform-types", "--test", fileURLToPath(import.meta.url)],
                {
                    env,
                    encoding: "utf8",
                    timeout: 30000,
                },
            );

            assert.ifError(result.error);
            assert.equal(result.status, 0, result.stdout + result.stderr);
            assert.match(result.stdout, /# tests 14\b/);
            assert.match(result.stdout, /# fail 0\b/);
        });
    }
} else {
    const getRouteUrl = new URL("../src/app/api/health/route.ts", import.meta.url).href;
    const postRouteUrl = new URL("../src/app/api/health/logs/route.ts", import.meta.url).href;
    const dateUrl = new URL("../src/lib/utils/date.ts", import.meta.url).href;
    const stateKey = Symbol.for("lifeos.health-date-test.dependencies");
    const dependencies = {};
    globalThis[stateKey] = dependencies;

    // Only authentication and Prisma are replaced. The actual client, handlers,
    // request validation, date utilities and NextResponse serialization execute.
    registerHooks({
        resolve(specifier, context, nextResolve) {
            if ([getRouteUrl, postRouteUrl].includes(context.parentURL)) {
                if (["@/lib/auth", "@/lib/prisma"].includes(specifier)) {
                    const name = specifier.endsWith("auth") ? "auth" : "prisma";
                    const source = `export const ${name} = globalThis[
                        Symbol.for("lifeos.health-date-test.dependencies")
                    ].${name};`;

                    return {
                        url: `data:text/javascript,${encodeURIComponent(source)}`,
                        shortCircuit: true,
                    };
                }

                if (specifier === "next/server") {
                    return nextResolve("next/server.js", context);
                }
            }

            if (specifier === "@/lib/utils/date") {
                return nextResolve(dateUrl, context);
            }

            return nextResolve(specifier, context);
        },
    });

    const createdAt = new Date("2026-10-18T00:15:27.123Z");
    const updatedAt = new Date("2026-10-19T23:45:10.456Z");
    const records = [];
    let databaseCalls = 0;

    dependencies.auth = {
        api: {
            async getSession() {
                return { user: { id: "health-date-user" } };
            },
        },
    };
    dependencies.prisma = {
        healthLog: {
            async findMany({ where }) {
                databaseCalls++;
                assert.equal(where.userId, "health-date-user");
                return records;
            },
            async findFirst({ where }) {
                databaseCalls++;
                assert.equal(where.userId, "health-date-user");
                return records.find((record) => record.id === where.id) ?? null;
            },
            async findUnique({ where }) {
                databaseCalls++;
                const { userId, date } = where.userId_date;
                assert.equal(userId, "health-date-user");
                assert.equal(date.toISOString().slice(10), "T00:00:00.000Z");
                return records.find((record) => record.date.getTime() === date.getTime()) ?? null;
            },
            async create({ data }) {
                databaseCalls++;
                assert.equal(data.userId, "health-date-user");
                const record = {
                    ...data,
                    id: `health-log-${records.length}`,
                    createdAt,
                    updatedAt,
                };
                records.push(record);
                return record;
            },
            async update({ where, data }) {
                databaseCalls++;
                const record = records.find((item) => item.id === where.id);
                assert.ok(record);
                Object.assign(record, data);
                return record;
            },
        },
        healthTargets: {
            async findUnique({ where }) {
                databaseCalls++;
                assert.equal(where.userId, "health-date-user");
                return {
                    weightGoalKg: null,
                    stepsPerDay: 8000,
                    sleepMinutesPerDay: null,
                    waterMlPerDay: null,
                    caloriesKcalPerDay: null,
                    proteinGramsPerDay: null,
                    carbsGramsPerDay: null,
                    fiberGramsPerDay: null,
                    updatedAt,
                };
            },
        },
    };

    const { GET } = await import(getRouteUrl);
    const { POST } = await import(postRouteUrl);
    const { healthApi } = await import("../src/features/health/api/health-api.ts");
    const { formatDateValue, formatDateDisplay, parseDateValue } = await import(dateUrl);
    const { createHealthLogSchema } = await import(
        "../src/features/health/schemas/health-log-schema.ts"
    );
    const { getTodayDateKey, getTodayHealthLog, getWeightTrend } = await import(
        "../src/features/health/utils/health-calculations.ts"
    );

    globalThis.fetch = async (url, init) => {
        const request = new Request(`http://localhost${url}`, init);
        const response = init.method === "POST" ? await POST(request) : await GET(request);
        assert.equal(response.headers.get("cache-control"), "private, no-store");
        return response;
    };

    test("the child process actually uses the requested time zone", () => {
        assert.equal(
            new Date("2026-10-18T00:00:00.000Z").getTimezoneOffset(),
            timeZones[process.env.TZ],
        );
    });

    const dates = [
        "2026-10-18",
        "2026-03-07", "2026-03-08", "2026-03-09",
        "2026-10-31", "2026-11-01", "2026-11-02",
        "2024-02-29", "2026-01-01", "2026-12-31",
    ];

    for (const date of dates) {
        test(`POST, edit and GET preserve ${date} and ISO timestamps`, async () => {
            const saved = await healthApi.saveHealthLog({ date, steps: 4000 });
            assert.equal(saved.date, date);
            assert.equal(saved.createdAt, createdAt.toISOString());
            assert.equal(saved.updatedAt, updatedAt.toISOString());

            const databaseRecord = records.find((record) => record.id === saved.id);
            assert.equal(databaseRecord.date.toISOString(), `${date}T00:00:00.000Z`);

            const edited = await healthApi.saveHealthLog({ id: saved.id, date, steps: 5000 });
            assert.equal(edited.date, date);
            assert.equal(edited.id, saved.id);
            assert.equal(edited.steps, 5000);

            const data = await healthApi.getHealthData();
            const loaded = data.logs.find((log) => log.id === saved.id);
            assert.deepEqual(loaded, edited);
            assert.equal(data.targets.updatedAt, updatedAt.toISOString());
        });
    }

    test("GET serializes a database DATE not created by the POST handler", async () => {
        records.push({
            ...records[0],
            id: "preexisting-log",
            date: new Date("2025-01-01T00:00:00.000Z"),
        });
        const { logs } = await healthApi.getHealthData();
        assert.equal(logs.find((log) => log.id === "preexisting-log").date, "2025-01-01");
    });

    test("invalid and noncanonical dates are rejected before accessing Prisma", async () => {
        for (const date of [
            "2026-02-30", "2026-02-29", "2026-04-31", "2026-13-01",
            "2026-00-01", "2026-10-00", "2026-1-1", "",
            "2026-10-18T00:00:00.000Z",
        ]) {
            const before = databaseCalls;
            const response = await POST(new Request("http://localhost/api/health/logs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ date, steps: 4000 }),
            }));
            assert.equal(response.status, 400, date);
            assert.equal((await response.json()).error, "INVALID_INPUT");
            assert.equal(databaseCalls, before);
        }
    });

    test("frontend selection, navigation and trends retain local calendar semantics", () => {
        for (const date of dates) {
            const local = parseDateValue(date);
            assert.equal(local.getHours(), 0);
            assert.equal(formatDateValue(local), date);
            assert.equal(getTodayDateKey(local), date);
            assert.equal(formatDateDisplay(date), new Intl.DateTimeFormat("en-IN", {
                day: "numeric", month: "short", year: "numeric",
            }).format(local));
        }

        for (const [before, after] of [
            ["2026-03-07", "2026-03-08"],
            ["2026-03-08", "2026-03-09"],
            ["2026-10-31", "2026-11-01"],
            ["2026-11-01", "2026-11-02"],
        ]) {
            const selected = parseDateValue(before);
            selected.setDate(selected.getDate() + 1);
            assert.equal(formatDateValue(selected), after);
        }

        const localTime = new Date(2026, 9, 18, 23, 30);
        const logs = [
            { date: "2026-10-17", weightKg: 70 },
            { date: "2026-10-18", weightKg: 69 },
            { date: "2026-10-19", weightKg: 68 },
        ];
        assert.equal(getTodayDateKey(localTime), "2026-10-18");
        assert.equal(getTodayHealthLog(logs, getTodayDateKey(localTime)), logs[1]);
        assert.deepEqual(getWeightTrend(logs, localTime, 2), logs.slice(0, 2));

        const form = {
            date: "2026-10-18", steps: "4000", weightKg: "", sleepHours: "",
            waterLitres: "", caloriesKcal: "", proteinGrams: "", carbsGrams: "", fiberGrams: "",
        };
        const schema = createHealthLogSchema("2026-10-18");
        assert.equal(schema.safeParse(form).success, true);
        assert.equal(schema.safeParse({ ...form, date: "2026-02-30" }).success, false);
        assert.equal(schema.safeParse({ ...form, date: "2026-10-19" }).success, false);
    });
}
