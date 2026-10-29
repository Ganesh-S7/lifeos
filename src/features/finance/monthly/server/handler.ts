import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateMutationOrigin } from "@/lib/server/request-origin";
import { financeConcurrencyError, financeMutationDiagnostics } from "../../server/finance-concurrency";
import { spendingPlanRequestSchema } from "../contracts";
import { readMonthlyBreakdown, saveSpendingPlan } from "./service";

function json(body: unknown, status = 200) {
    return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function handleMonthlyBreakdown(request: Request) {
    try {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "UNAUTHORIZED", message: "Please sign in to manage your finance data." }, 401);
        if (request.method === "GET") return json(await readMonthlyBreakdown(prisma, session.user.id));
        const originError = validateMutationOrigin(request);
        if (originError) return originError;
        const parsed = spendingPlanRequestSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "INVALID_INPUT", message: "Use unique categories and valid non-negative amounts with at most two decimal places." }, 400);
        return json({ plan: await saveSpendingPlan(prisma, session.user.id, parsed.data) });
    } catch (error) {
        console.error("[/api/finance/monthly-breakdown]", financeMutationDiagnostics(error));
        const conflict = financeConcurrencyError(error);
        if (conflict) return json(conflict, 409);
        return json({ error: "INTERNAL_SERVER_ERROR", message: "Unable to load or save your monthly breakdown. Please try again." }, 500);
    }
}
