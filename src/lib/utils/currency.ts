export function formatCurrency(
    amount: number,
    decimalDigits = 0,
): string {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: decimalDigits,
        maximumFractionDigits: decimalDigits,
    }).format(amount);
}