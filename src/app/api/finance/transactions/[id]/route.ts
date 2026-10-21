import { handleTransactionMutation } from "@/features/finance/server/transaction-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TransactionRouteContext {
    params: Promise<{ id: string }>;
}

export async function PUT(request: Request, context: TransactionRouteContext) {
    return handleTransactionMutation(request, "update", context.params);
}

export async function DELETE(request: Request, context: TransactionRouteContext) {
    return handleTransactionMutation(request, "delete", context.params);
}
