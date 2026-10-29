import { monthlyBreakdownResponseSchema, spendingPlanRequestSchema, spendingPlanSchema, type SpendingPlanRequest } from "./contracts";

export async function loadMonthlyBreakdown(signal?: AbortSignal) {
    const response = await fetch("/api/finance/monthly-breakdown", { cache: "no-store", credentials: "same-origin", signal });
    if (!response.ok) throw new Error("Unable to load your monthly breakdown. Please try again.");
    return monthlyBreakdownResponseSchema.parse(await response.json());
}

export async function putSpendingPlan(input: SpendingPlanRequest) {
    const parsed = spendingPlanRequestSchema.parse(input);
    const unavailable = "Unable to save your spending plan. Please try again.";
    const conflict = "Your financial data changed. Refresh and try again.";
    try {
        const response = await fetch("/api/finance/monthly-breakdown", {
            method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed),
        });
        if (!response.ok) throw new Error(response.status === 409 ? conflict : unavailable);
        return spendingPlanSchema.parse((await response.json()).plan);
    } catch (cause) {
        throw new Error(cause instanceof Error && cause.message === conflict ? conflict : unavailable);
    }
}
