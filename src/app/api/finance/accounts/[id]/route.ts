import { handleAccountMutation } from "@/features/finance/server/account-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AccountRouteContext {
    params: Promise<{ id: string }>;
}

export async function PUT(request: Request, context: AccountRouteContext) {
    return handleAccountMutation(request, "update", context.params);
}

export async function DELETE(request: Request, context: AccountRouteContext) {
    return handleAccountMutation(request, "delete", context.params);
}
