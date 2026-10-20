import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateMutationOrigin } from "@/lib/server/request-origin";
import { errorDiagnostics } from "@/lib/server/error-diagnostics";
import type { HealthTargets as HealthTargetsDto } from "@/features/health/types/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(body: unknown, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: {
            "Cache-Control": "private, no-store",
        },
    });
}

const healthTargetsSchema = z
    .object({
        weightGoalKg: z.number().finite().positive().nullable().optional(),

        stepsPerDay: z.number().int().nonnegative().nullable().optional(),

        sleepMinutesPerDay: z
            .number()
            .int()
            .min(0)
            .max(1440)
            .nullable()
            .optional(),

        waterMlPerDay: z
            .number()
            .int()
            .nonnegative()
            .nullable()
            .optional(),

        caloriesKcalPerDay: z
            .number()
            .int()
            .nonnegative()
            .nullable()
            .optional(),

        proteinGramsPerDay: z
            .number()
            .finite()
            .nonnegative()
            .nullable()
            .optional(),

        carbsGramsPerDay: z
            .number()
            .finite()
            .nonnegative()
            .nullable()
            .optional(),

        fiberGramsPerDay: z
            .number()
            .finite()
            .nonnegative()
            .nullable()
            .optional(),
    })
    .strict();

const targetFields = [
    "weightGoalKg",
    "stepsPerDay",
    "sleepMinutesPerDay",
    "waterMlPerDay",
    "caloriesKcalPerDay",
    "proteinGramsPerDay",
    "carbsGramsPerDay",
    "fiberGramsPerDay",
] as const;

function toHealthTargetsDto(
    target: NonNullable<
        Awaited<ReturnType<typeof prisma.healthTargets.findUnique>>
    >,
): HealthTargetsDto {
    return {
        weightGoalKg:
            target.weightGoalKg === null
                ? undefined
                : Number(target.weightGoalKg),

        stepsPerDay: target.stepsPerDay ?? undefined,
        sleepMinutesPerDay: target.sleepMinutesPerDay ?? undefined,
        waterMlPerDay: target.waterMlPerDay ?? undefined,
        caloriesKcalPerDay: target.caloriesKcalPerDay ?? undefined,

        proteinGramsPerDay:
            target.proteinGramsPerDay === null
                ? undefined
                : Number(target.proteinGramsPerDay),

        carbsGramsPerDay:
            target.carbsGramsPerDay === null
                ? undefined
                : Number(target.carbsGramsPerDay),

        fiberGramsPerDay:
            target.fiberGramsPerDay === null
                ? undefined
                : Number(target.fiberGramsPerDay),

        updatedAt: target.updatedAt.toISOString(),
    };
}

export async function PUT(request: Request) {
    try {
        // 1. Authenticate the user.
        const session = await auth.api.getSession({
            headers: request.headers,
        });

        if (!session) {
            return jsonNoStore(
                {
                    error: "UNAUTHORIZED",
                    message: "Please sign in to save health targets.",
                },
                401,
            );
        }

        const userId = session.user.id;

        const originError = validateMutationOrigin(request);
        if (originError) {
            return originError;
        }

        // 2. Validate the request body.
        const body: unknown = await request.json().catch(() => null);
        const parsed = healthTargetsSchema.safeParse(body);

        if (!parsed.success) {
            return jsonNoStore(
                {
                    error: "INVALID_INPUT",
                    message: "Please check your health targets.",
                    details: parsed.error.flatten(),
                },
                400,
            );
        }

        const input = parsed.data;

        // Treat this request as a complete replacement of the targets.
        // Missing or null values clear their corresponding fields.
        const targetData = {
            weightGoalKg: input.weightGoalKg ?? null,
            stepsPerDay: input.stepsPerDay ?? null,
            sleepMinutesPerDay: input.sleepMinutesPerDay ?? null,
            waterMlPerDay: input.waterMlPerDay ?? null,
            caloriesKcalPerDay: input.caloriesKcalPerDay ?? null,
            proteinGramsPerDay: input.proteinGramsPerDay ?? null,
            carbsGramsPerDay: input.carbsGramsPerDay ?? null,
            fiberGramsPerDay: input.fiberGramsPerDay ?? null,
        };

        const hasTargets = targetFields.some(
            (field) => targetData[field] !== null,
        );

        // If every target is empty, remove the user's targets record.
        if (!hasTargets) {
            await prisma.healthTargets.deleteMany({
                where: { userId },
            });

            return jsonNoStore({ targets: null });
        }

        // 3. Create targets if none exist; otherwise replace the values.
        const savedTargets = await prisma.healthTargets.upsert({
            where: { userId },
            create: {
                userId,
                ...targetData,
            },
            update: targetData,
        });

        return jsonNoStore({
            targets: toHealthTargetsDto(savedTargets),
        });
    } catch (error) {
        console.error("[PUT /api/health/targets]", errorDiagnostics(error));

        return jsonNoStore(
            {
                error: "INTERNAL_SERVER_ERROR",
                message: "Unable to save your health targets.",
            },
            500,
        );
    }
}

export async function DELETE(request: Request) {
    try {
        // 1. Authenticate the user.
        const session = await auth.api.getSession({
            headers: request.headers,
        });

        if (!session) {
            return jsonNoStore(
                {
                    error: "UNAUTHORIZED",
                    message: "Please sign in to clear health targets.",
                },
                401,
            );
        }

        const originError = validateMutationOrigin(request);
        if (originError) {
            return originError;
        }

        // 2. Delete only this user's targets.
        await prisma.healthTargets.deleteMany({
            where: {
                userId: session.user.id,
            },
        });

        return jsonNoStore({
            success: true,
            targets: null,
        });
    } catch (error) {
        console.error("[DELETE /api/health/targets]", errorDiagnostics(error));

        return jsonNoStore(
            {
                error: "INTERNAL_SERVER_ERROR",
                message: "Unable to clear your health targets.",
            },
            500,
        );
    }
}
