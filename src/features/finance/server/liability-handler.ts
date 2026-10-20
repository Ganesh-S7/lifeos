import { NextResponse } from "next/server";
import { validateMutationOrigin } from "../../../lib/server/request-origin";
import { financeConcurrencyError, financeMutationDiagnostics } from "./finance-concurrency";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
    financeRecordParamsSchema,
    liabilityRequestSchema,
} from "../schemas/finance-request-schema";
import { LiabilityNotFoundError, mutateLiability } from "./liability-mutations";

function jsonNoStore(body: unknown, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: { "Cache-Control": "private, no-store" },
    });
}

export async function handleLiabilityMutation(
    request: Request,
    kind: "create" | "update" | "delete",
    params?: Promise<{ id: string }>,
) {
    try {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
            return jsonNoStore({
                error: "UNAUTHORIZED",
                message: "Please sign in to manage your finance data.",
            }, 401);
        }

        const originError = validateMutationOrigin(request);
        if (originError) {
            return originError;
        }

        const parsedParams = kind === "create" ? null
            : financeRecordParamsSchema.safeParse(await params);
        if (parsedParams && !parsedParams.success) {
            return jsonNoStore({
                error: "INVALID_INPUT",
                message: "Please provide a valid liability ID.",
                details: parsedParams.error.flatten(),
            }, 400);
        }

        const id = parsedParams?.success ? parsedParams.data.id : "";
        if (kind === "delete") {
            const result = await mutateLiability(prisma, session.user.id, { kind, id });
            return jsonNoStore(result);
        }

        const body: unknown = await request.json().catch(() => null);
        const parsed = liabilityRequestSchema.safeParse(body);
        if (!parsed.success) {
            return jsonNoStore({
                error: "INVALID_INPUT",
                message: "Please check the liability details.",
                details: parsed.error.flatten(),
            }, 400);
        }

        const result = await mutateLiability(
            prisma,
            session.user.id,
            kind === "create" ? { kind, input: parsed.data } : { kind, id, input: parsed.data },
        );
        return jsonNoStore(result, kind === "create" ? 201 : 200);
    } catch (error) {
        if (error instanceof LiabilityNotFoundError) {
            return jsonNoStore({
                error: "NOT_FOUND",
                message: "Liability not found.",
            }, 404);
        }
        const conflict = financeConcurrencyError(error);
        if (conflict) {
            console.warn(`[${request.method} /api/finance/liabilities]`, financeMutationDiagnostics(error));
            return jsonNoStore(conflict, 409);
        }
        console.error(`[${request.method} /api/finance/liabilities]`, financeMutationDiagnostics(error));
        return jsonNoStore({
            error: "INTERNAL_SERVER_ERROR",
            message: "Unable to update your liabilities.",
        }, 500);
    }
}
