import { handleAccountMutation } from "@/features/finance/server/account-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    return handleAccountMutation(request, "create");
}
