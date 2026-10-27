import { handleExpenseCategories } from "@/features/finance/server/expense-category-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    return handleExpenseCategories(request);
}

export async function POST(request: Request) {
    return handleExpenseCategories(request);
}
