import { handleInvestmentMutation } from "@/features/finance/server/investment-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    return handleInvestmentMutation(request, "create");
}
