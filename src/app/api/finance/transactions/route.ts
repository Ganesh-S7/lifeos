import { handleTransactionMutation } from "@/features/finance/server/transaction-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    return handleTransactionMutation(request, "create");
}
