export function formatDateValue(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

/**
 * Serialize a Prisma DATE represented as UTC midnight, without local conversion.
 * Use formatDateValue for frontend local calendar dates instead.
 */
export function formatUtcDateValue(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function formatDateDisplay(date: string | Date): string {
    // Parse YYYY-MM-DD as a local calendar date to avoid timezone shifts.
    const dateValue =
        typeof date === "string" ? parseDateValue(date) : date;

    return new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(dateValue);
}

export function parseDateValue(value: string): Date {
    const [year, month, day] = value.split("-").map(Number);

    return new Date(year, month - 1, day);
}
