import { handleLiabilityMutation } from "@/features/finance/server/liability-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LiabilityRouteContext {
    params: Promise<{ id: string }>;
}

export async function PUT(request: Request, context: LiabilityRouteContext) {
    return handleLiabilityMutation(request, "update", context.params);
}

export async function DELETE(request: Request, context: LiabilityRouteContext) {
    return handleLiabilityMutation(request, "delete", context.params);
}
