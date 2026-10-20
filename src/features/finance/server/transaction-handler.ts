import { NextResponse } from "next/server";
import { validateMutationOrigin } from "../../../lib/server/request-origin";
import { financeConcurrencyError, financeMutationDiagnostics } from "./finance-concurrency";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
    financeRecordParamsSchema,
    financeTransactionRequestSchema,
} from "../schemas/finance-request-schema";
import { LedgerConflictError } from "./finance-ledger";
import {
    mutateTransaction,
    TransactionMutationError,
} from "./transaction-mutations";

function jsonNoStore(body: unknown, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: { "Cache-Control": "private, no-store" },
    });
}

export async function handleTransactionMutation(
    request: Request,
    kind: "create" | "update" | "delete",
    params?: Promise<{ id: string }>,
) {
    try {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
            return jsonNoStore({ error: "UNAUTHORIZED", message: "Please sign in to manage your finance data." }, 401);
        }
        const originError = validateMutationOrigin(request);
        if (originError) {
            return originError;
        }

        const parsedParams = kind === "create" ? null : financeRecordParamsSchema.safeParse(await params);
        if (parsedParams && !parsedParams.success) {
            return jsonNoStore({
                error: "INVALID_INPUT",
                message: "Please provide a valid transaction ID.",
                details: parsedParams.error.flatten(),
            }, 400);
        }
        const id = parsedParams?.success ? parsedParams.data.id : "";
        if (kind === "delete") {
            return jsonNoStore(await mutateTransaction(prisma, session.user.id, { kind, id }));
        }

        const parsed = financeTransactionRequestSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return jsonNoStore({
                error: "INVALID_INPUT",
                message: "Please check the transaction details.",
                details: parsed.error.flatten(),
            }, 400);
        }
        const input = parsed.data;
        const result = await mutateTransaction(
            prisma,
            session.user.id,
            kind === "create" ? { kind, input } : { kind, id, input },
        );
        return jsonNoStore(result, kind === "create" ? 201 : 200);
    } catch (error) {
        if (error instanceof TransactionMutationError) {
            return jsonNoStore({ error: error.code, message: error.message }, error.status);
        }
        if (error instanceof LedgerConflictError) {
            return jsonNoStore({ error: error.code, message: error.message }, 409);
        }
        const conflict = financeConcurrencyError(error);
        if (conflict) {
            console.warn(`[${request.method} /api/finance/transactions]`, financeMutationDiagnostics(error));
            return jsonNoStore(conflict, 409);
        }
        console.error(`[${request.method} /api/finance/transactions]`, financeMutationDiagnostics(error));
        return jsonNoStore({ error: "INTERNAL_SERVER_ERROR", message: "Unable to update your transactions." }, 500);
    }
}
