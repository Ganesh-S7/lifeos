import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
    formatDateValue,
    parseDateValue,
} from "@/lib/utils/date";
import type { HealthLog as HealthLogDto } from "@/features/health/types/health";

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

function isValidCalendarDate(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) {
        return false;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const date = new Date(year, month - 1, day);

    return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
}

const healthLogRequestSchema = z
    .object({
        id: z.string().min(1).optional(),

        date: z
            .string()
            .refine(
                isValidCalendarDate,
                "Enter a valid calendar date.",
            ),

        weightKg: z.number().finite().positive().optional(),

        steps: z.number().int().nonnegative().optional(),

        sleepMinutes: z
            .number()
            .int()
            .min(0)
            .max(1440)
            .optional(),

        waterMl: z.number().int().nonnegative().optional(),

        caloriesKcal: z.number().int().nonnegative().optional(),

        proteinGrams: z.number().finite().nonnegative().optional(),

        carbsGrams: z.number().finite().nonnegative().optional(),

        fiberGrams: z.number().finite().nonnegative().optional(),
    })
    .strict();

const measurementFields = [
    "weightKg",
    "steps",
    "sleepMinutes",
    "waterMl",
    "caloriesKcal",
    "proteinGrams",
    "carbsGrams",
    "fiberGrams",
] as const;

export async function POST(request: Request) {
    try {
        // 1. Authenticate the user.
        const session = await auth.api.getSession({
            headers: request.headers,
        });

        if (!session) {
            return jsonNoStore(
                {
                    error: "UNAUTHORIZED",
                    message: "Please sign in to save health data.",
                },
                401,
            );
        }

        const userId = session.user.id;

        // 2. Parse and validate the request body.
        const body: unknown = await request
            .json()
            .catch(() => null);

        const parsed = healthLogRequestSchema.safeParse(body);

        if (!parsed.success) {
            return jsonNoStore(
                {
                    error: "INVALID_INPUT",
                    message: "Please check the health log details.",
                    details: parsed.error.flatten(),
                },
                400,
            );
        }

        const input = parsed.data;

        // 3. Require at least one health measurement.
        const hasMeasurements = measurementFields.some(
            (field) => input[field] !== undefined,
        );

        if (!hasMeasurements) {
            return jsonNoStore(
                {
                    error: "NO_MEASUREMENTS",
                    message: "Enter at least one health measurement.",
                },
                400,
            );
        }

        // Keep the date as a local calendar date.
        const date = parseDateValue(input.date);

        // 4. Find an existing record by ID, but only for this user.
        const existingById = input.id
            ? await prisma.healthLog.findFirst({
                  where: {
                      id: input.id,
                      userId,
                  },
              })
            : null;

        // 5. Find an existing record for the requested date.
        const existingByDate = await prisma.healthLog.findUnique({
            where: {
                userId_date: {
                    userId,
                    date,
                },
            },
        });

        // An edited record cannot move onto another record's date.
        if (
            existingById &&
            existingByDate &&
            existingById.id !== existingByDate.id
        ) {
            return jsonNoStore(
                {
                    error: "DUPLICATE_DATE",
                    message:
                        "A health log already exists for this date. Edit that entry instead.",
                },
                409,
            );
        }

        // 6. Explicit nulls clear measurements that were removed
        // while editing an existing daily record.
        const logData = {
            date,
            weightKg: input.weightKg ?? null,
            steps: input.steps ?? null,
            sleepMinutes: input.sleepMinutes ?? null,
            waterMl: input.waterMl ?? null,
            caloriesKcal: input.caloriesKcal ?? null,
            proteinGrams: input.proteinGrams ?? null,
            carbsGrams: input.carbsGrams ?? null,
            fiberGrams: input.fiberGrams ?? null,
        };

        // Prefer the supplied record ID; otherwise update the
        // existing daily record or create a new one.
        const existing = existingById ?? existingByDate;

        const savedLog = existing
            ? await prisma.healthLog.update({
                  where: {
                      id: existing.id,
                  },
                  data: logData,
              })
            : await prisma.healthLog.create({
                  data: {
                      ...logData,
                      userId,
                  },
              });

        // 7. Convert database values into the frontend DTO.
        const response: HealthLogDto = {
            id: savedLog.id,
            date: formatDateValue(savedLog.date),

            weightKg:
                savedLog.weightKg === null
                    ? undefined
                    : Number(savedLog.weightKg),

            steps: savedLog.steps ?? undefined,
            sleepMinutes: savedLog.sleepMinutes ?? undefined,
            waterMl: savedLog.waterMl ?? undefined,
            caloriesKcal: savedLog.caloriesKcal ?? undefined,

            proteinGrams:
                savedLog.proteinGrams === null
                    ? undefined
                    : Number(savedLog.proteinGrams),

            carbsGrams:
                savedLog.carbsGrams === null
                    ? undefined
                    : Number(savedLog.carbsGrams),

            fiberGrams:
                savedLog.fiberGrams === null
                    ? undefined
                    : Number(savedLog.fiberGrams),

            createdAt: savedLog.createdAt.toISOString(),
            updatedAt: savedLog.updatedAt.toISOString(),
        };

        return jsonNoStore({ log: response }, 200);
    } catch (error) {
        // A concurrent request may have created the same
        // user/date record between our lookup and create.
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "P2002"
        ) {
            return jsonNoStore(
                {
                    error: "DUPLICATE_DATE",
                    message:
                        "A health log already exists for this date.",
                },
                409,
            );
        }

        console.error("[POST /api/health/logs]", error);

        return jsonNoStore(
            {
                error: "INTERNAL_SERVER_ERROR",
                message: "Unable to save your health log.",
            },
            500,
        );
    }
}