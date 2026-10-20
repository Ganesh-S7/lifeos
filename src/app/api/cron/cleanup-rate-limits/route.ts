import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/server/cron-auth";
import { errorDiagnostics } from "@/lib/server/error-diagnostics";
import { cleanupRateLimits } from "@/lib/server/rate-limit-cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function jsonNoStore(body: unknown, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: { "Cache-Control": "no-store" },
    });
}

export async function GET(request: Request) {
    if (!isAuthorizedCronRequest(request, process.env.CRON_SECRET)) {
        return jsonNoStore({
            error: "UNAUTHORIZED",
            message: "Unauthorized cron request.",
        }, 401);
    }

    try {
        // Authorization precedes even database initialization/configuration.
        const { prisma } = await import("@/lib/prisma");
        const result = await cleanupRateLimits(prisma);
        console.info("[cron cleanup-rate-limits]", result);
        return jsonNoStore(result);
    } catch (error) {
        console.error("[cron cleanup-rate-limits]", errorDiagnostics(error));
        return jsonNoStore({
            error: "INTERNAL_SERVER_ERROR",
            message: "Unable to clean up rate limits.",
        }, 500);
    }
}
