import { handleInvestmentMutation } from "@/features/finance/server/investment-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface InvestmentRouteContext {
    params: Promise<{ id: string }>;
}

export async function PUT(request: Request, context: InvestmentRouteContext) {
    return handleInvestmentMutation(request, "update", context.params);
}

export async function DELETE(request: Request, context: InvestmentRouteContext) {
    return handleInvestmentMutation(request, "delete", context.params);
}
