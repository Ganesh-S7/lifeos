import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateMutationOrigin } from "@/lib/server/request-origin";
import { errorDiagnostics } from "@/lib/server/error-diagnostics";

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

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        // 1. Authenticate the user.
        const session = await auth.api.getSession({
            headers: request.headers,
        });

        if (!session) {
            return jsonNoStore(
                {
                    error: "UNAUTHORIZED",
                    message: "Please sign in to delete health data.",
                },
                401,
            );
        }

        const originError = validateMutationOrigin(request);
        if (originError) {
            return originError;
        }

        // 2. Resolve and validate the record ID.
        const { id } = await params;

        if (!id.trim()) {
            return jsonNoStore(
                {
                    error: "INVALID_INPUT",
                    message: "A valid health log ID is required.",
                },
                400,
            );
        }

        // 3. Delete only a record belonging to the signed-in user.
        const result = await prisma.healthLog.deleteMany({
            where: {
                id,
                userId: session.user.id,
            },
        });

        if (result.count === 0) {
            return jsonNoStore(
                {
                    error: "NOT_FOUND",
                    message: "Health log not found.",
                },
                404,
            );
        }

        return jsonNoStore({
            success: true,
            message: "Health log deleted successfully.",
        });
    } catch (error) {
        console.error("[DELETE /api/health/logs/[id]]", errorDiagnostics(error));

        return jsonNoStore(
            {
                error: "INTERNAL_SERVER_ERROR",
                message: "Unable to delete your health log.",
            },
            500,
        );
    }
}
