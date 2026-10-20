import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { errorDiagnostics } from "@/lib/server/error-diagnostics";
import { formatUtcDateValue } from "@/lib/utils/date";

import type {
    HealthLog as HealthLogDto,
    HealthTargets as HealthTargetsDto,
} from "@/features/health/types/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(
    body: unknown,
    status = 200,
) {
    return NextResponse.json(body, {
        status,
        headers: {
            "Cache-Control": "private, no-store",
        },
    });
}

export async function GET(request: Request) {
    try {
        // 1. Identify the authenticated user.
        const session = await auth.api.getSession({
            headers: request.headers,
        });

        if (!session) {
            return jsonNoStore(
                {
                    error: "UNAUTHORIZED",
                    message: "Please sign in to access your health data.",
                },
                401,
            );
        }

        const userId = session.user.id;

        // 2. Retrieve only this user's health data.
        const [databaseLogs, databaseTargets] = await Promise.all([
            prisma.healthLog.findMany({
                where: {
                    userId,
                },
                orderBy: {
                    date: "desc",
                },
            }),

            prisma.healthTargets.findUnique({
                where: {
                    userId,
                },
            }),
        ]);

        // 3. Convert Prisma records into the existing frontend types.
        //
        // Prisma Decimal values are converted to numbers.
        // Database NULL values become undefined, preserving the
        // existing frontend convention for unrecorded measurements.

        const logs: HealthLogDto[] = databaseLogs.map((log) => ({
            id: log.id,
            date: formatUtcDateValue(log.date),

            weightKg:
                log.weightKg === null
                    ? undefined
                    : Number(log.weightKg),

            steps: log.steps ?? undefined,
            sleepMinutes: log.sleepMinutes ?? undefined,
            waterMl: log.waterMl ?? undefined,
            caloriesKcal: log.caloriesKcal ?? undefined,

            proteinGrams:
                log.proteinGrams === null
                    ? undefined
                    : Number(log.proteinGrams),

            carbsGrams:
                log.carbsGrams === null
                    ? undefined
                    : Number(log.carbsGrams),

            fiberGrams:
                log.fiberGrams === null
                    ? undefined
                    : Number(log.fiberGrams),

            createdAt: log.createdAt.toISOString(),
            updatedAt: log.updatedAt.toISOString(),
        }));

        const targets: HealthTargetsDto | null =
            databaseTargets
                ? {
                    weightGoalKg:
                        databaseTargets.weightGoalKg === null
                            ? undefined
                            : Number(databaseTargets.weightGoalKg),

                    stepsPerDay:
                        databaseTargets.stepsPerDay ?? undefined,

                    sleepMinutesPerDay:
                        databaseTargets.sleepMinutesPerDay ?? undefined,

                    waterMlPerDay:
                        databaseTargets.waterMlPerDay ?? undefined,

                    caloriesKcalPerDay:
                        databaseTargets.caloriesKcalPerDay ?? undefined,

                    proteinGramsPerDay:
                        databaseTargets.proteinGramsPerDay === null
                            ? undefined
                            : Number(databaseTargets.proteinGramsPerDay),

                    carbsGramsPerDay:
                        databaseTargets.carbsGramsPerDay === null
                            ? undefined
                            : Number(databaseTargets.carbsGramsPerDay),

                    fiberGramsPerDay:
                        databaseTargets.fiberGramsPerDay === null
                            ? undefined
                            : Number(databaseTargets.fiberGramsPerDay),

                    updatedAt:
                        databaseTargets.updatedAt.toISOString(),
                }
                : null;

        // 4. Return the data without caching user-specific results.
        return jsonNoStore({
            logs,
            targets,
        });
    } catch (error) {
        console.error("[GET /api/health]", errorDiagnostics(error));

        return jsonNoStore(
            {
                error: "INTERNAL_SERVER_ERROR",
                message: "Unable to load your health data.",
            },
            500,
        );
    }
}
