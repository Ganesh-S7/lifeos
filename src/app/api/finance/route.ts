import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readFinanceForUser } from "@/features/finance/server/finance-read";

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

export async function GET(request: Request) {
    try {
        const session = await auth.api.getSession({
            headers: request.headers,
        });

        if (!session) {
            return jsonNoStore({
                error: "UNAUTHORIZED",
                message: "Please sign in to access your finance data.",
            }, 401);
        }

        const data = await readFinanceForUser(prisma, session.user.id);
        return jsonNoStore(data);
    } catch (error) {
        console.error("[GET /api/finance]", error);

        return jsonNoStore({
            error: "INTERNAL_SERVER_ERROR",
            message: "Unable to load your finance data.",
        }, 500);
    }
}
