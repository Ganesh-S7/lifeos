import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/server/cron-auth";
import { databaseDiagnosticCategory } from "@/lib/server/database-diagnostic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(body: unknown, status: number, headers?: Record<string, string>) {
    return NextResponse.json(body, {
        status,
        headers: { ...headers, "Cache-Control": "no-store" },
    });
}

/** Temporary Preview diagnostic. Remove after the runtime connection is verified. */
export async function POST(request: Request) {
    if (process.env.VERCEL_ENV !== "preview") {
        return jsonNoStore({ error: "NOT_FOUND" }, 404);
    }
    // Reuse only the timing-safe comparison, with a dedicated diagnostic secret.
    if (!isAuthorizedCronRequest(request, process.env.DB_DIAGNOSTIC_SECRET)) {
        return jsonNoStore({ error: "UNAUTHORIZED" }, 401);
    }

    let initializing = true;
    try {
        const { prisma } = await import("@/lib/prisma");
        initializing = false;
        await prisma.$queryRaw`SELECT 1`;
        return jsonNoStore({
            ok: true,
            check: "database_connection",
            result: "passed",
        }, 200);
    } catch (error) {
        const category = databaseDiagnosticCategory(
            error,
            initializing ? "DATABASE_CONFIGURATION" : "UNKNOWN_DATABASE_ERROR",
        );
        console.error("[db-diagnostic failed]", category);
        return jsonNoStore({
            ok: false,
            check: "database_connection",
            result: "failed",
            category,
        }, 503);
    }
}

function unsupportedMethod() {
    if (process.env.VERCEL_ENV !== "preview") {
        return jsonNoStore({ error: "NOT_FOUND" }, 404);
    }
    return jsonNoStore({ error: "METHOD_NOT_ALLOWED" }, 405, { Allow: "POST" });
}

// Explicit rejections ensure even unsupported methods receive no-store headers.
export {
    unsupportedMethod as GET,
    unsupportedMethod as HEAD,
    unsupportedMethod as PUT,
    unsupportedMethod as PATCH,
    unsupportedMethod as DELETE,
    unsupportedMethod as OPTIONS,
};
