import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateMutationOrigin } from "../../../lib/server/request-origin";
import { expenseCategoryRequestSchema } from "../schemas/expense-category-schema";
import { financeConcurrencyError, financeMutationDiagnostics } from "./finance-concurrency";
import { categoryDto, ensureExpenseCategory, readExpenseCategories } from "./expense-categories";

function json(body: unknown, status = 200) {
    return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function handleExpenseCategories(request: Request) {
    try {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
            return json({ error: "UNAUTHORIZED", message: "Please sign in to manage your finance data." }, 401);
        }
        if (request.method === "GET") {
            return json({ categories: await readExpenseCategories(prisma, session.user.id) });
        }
        const originError = validateMutationOrigin(request);
        if (originError) return originError;
        const parsed = expenseCategoryRequestSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return json({ error: "INVALID_INPUT", message: "Enter a valid category name of 1 to 100 characters." }, 400);
        }
        const category = await ensureExpenseCategory(prisma, session.user.id, parsed.data.name);
        // Creation is idempotent: an equivalent category returns the same owned record.
        return json({ category: categoryDto(category) });
    } catch (error) {
        const conflict = financeConcurrencyError(error);
        console.error("[/api/finance/categories]", financeMutationDiagnostics(error));
        if (conflict) return json(conflict, 409);
        return json({ error: "INTERNAL_SERVER_ERROR", message: "Unable to load or save expense categories. Please try again." }, 500);
    }
}
