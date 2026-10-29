import { formatCurrency } from "@/lib/utils/currency";

/** Keep whole-rupee source rows compact without rounding recorded paise away. */
export function formatMonthlyMoney(amount: number) {
    return formatCurrency(amount, Number.isInteger(amount) ? 0 : 2);
}
