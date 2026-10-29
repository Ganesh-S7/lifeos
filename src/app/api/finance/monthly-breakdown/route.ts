import { handleMonthlyBreakdown } from "@/features/finance/monthly/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    return handleMonthlyBreakdown(request);
}

export async function PUT(request: Request) {
    return handleMonthlyBreakdown(request);
}
