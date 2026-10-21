import { handleLiabilityMutation } from "@/features/finance/server/liability-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    return handleLiabilityMutation(request, "create");
}
