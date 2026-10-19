import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
    bankAccountRequestSchema,
    financeRecordParamsSchema,
} from "../schemas/finance-request-schema";
import { AccountInUseError, AccountNotFoundError, mutateAccount } from "./account-mutations";

function jsonNoStore(body: unknown, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: { "Cache-Control": "private, no-store" },
    });
}

export async function handleAccountMutation(
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

        const parsedParams = kind === "create" ? null
            : financeRecordParamsSchema.safeParse(await params);
        if (parsedParams && !parsedParams.success) {
            return jsonNoStore({
                error: "INVALID_INPUT",
                message: "Please provide a valid bank account ID.",
                details: parsedParams.error.flatten(),
            }, 400);
        }

        const id = parsedParams?.success ? parsedParams.data.id : "";
        if (kind === "delete") {
            const result = await mutateAccount(prisma, session.user.id, { kind, id });
            return jsonNoStore(result);
        }

        const body: unknown = await request.json().catch(() => null);
        const parsed = bankAccountRequestSchema.safeParse(body);
        if (!parsed.success) {
            return jsonNoStore({
                error: "INVALID_INPUT",
                message: "Please check the bank account details.",
                details: parsed.error.flatten(),
            }, 400);
        }

        const result = await mutateAccount(
            prisma,
            session.user.id,
            kind === "create" ? { kind, input: parsed.data } : { kind, id, input: parsed.data },
        );
        return jsonNoStore(result, kind === "create" ? 201 : 200);
    } catch (error) {
        if (error instanceof AccountNotFoundError) {
            return jsonNoStore({ error: "NOT_FOUND", message: error.message }, 404);
        }
        if (error instanceof AccountInUseError) {
            return jsonNoStore({ error: "ACCOUNT_HAS_TRANSACTIONS", message: error.message }, 409);
        }
        console.error(`[${request.method} /api/finance/accounts]`, error);
        return jsonNoStore({
            error: "INTERNAL_SERVER_ERROR",
            message: "Unable to update your bank accounts.",
        }, 500);
    }
}
