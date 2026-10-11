import type {
    FinanceTransaction,
    FinancialPositionSnapshot,
} from "../types/finance";

export type ComparisonTone = "positive" | "negative" | "neutral";
export type ComparisonDirection = "up" | "down" | "unchanged";

export type Comparison =
    | { available: false; reason: string }
    | {
        available: true;
        change: number;
        absoluteChange: number;
        percentage: number | null;
        direction: ComparisonDirection;
        tone: ComparisonTone;
    };

function localDateValue(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function equivalentElapsedPeriods(today: Date) {
    const year = today.getFullYear();
    const monthIndex = today.getMonth();
    const priorMonthLastDay = new Date(year, monthIndex, 0).getDate();
    const previousEndDay = Math.min(today.getDate(), priorMonthLastDay);

    return {
        currentStart: localDateValue(new Date(year, monthIndex, 1)),
        currentEnd: localDateValue(today),
        previousStart: localDateValue(new Date(year, monthIndex - 1, 1)),
        previousEnd: localDateValue(new Date(year, monthIndex - 1, previousEndDay)),
        /** Local midnight starting this month, expressed as a UTC timestamp. */
        previousMonthEndCutoff: new Date(year, monthIndex, 1).toISOString(),
    };
}

export function activityInPeriod(
    transactions: FinanceTransaction[],
    start: string,
    end: string,
) {
    let income = 0;
    let expenses = 0;
    for (const transaction of transactions) {
        if (transaction.date < start || transaction.date > end) continue;
        if (transaction.type === "income") income += transaction.amount;
        if (transaction.type === "expense") expenses += transaction.amount;
    }
    const netCashFlow = income - expenses;
    return {
        income,
        expenses,
        netCashFlow,
        savingsRate: income > 0 ? netCashFlow / income * 100 : null,
    };
}

export function compareValues(
    current: number,
    previous: number | null,
    inverse = false,
    missingReason = "No previous-period data",
): Comparison {
    if (previous === null || !Number.isFinite(previous) || !Number.isFinite(current)) {
        return { available: false, reason: missingReason };
    }
    const change = current - previous;
    const direction = change > 0 ? "up" : change < 0 ? "down" : "unchanged";
    const tone = change === 0 ? "neutral"
        : (change > 0) !== inverse ? "positive" : "negative";
    return {
        available: true,
        change,
        absoluteChange: Math.abs(change),
        percentage: previous === 0 ? null : Math.abs(change / previous) * 100,
        direction,
        tone,
    };
}

export function comparePercentagePoints(
    current: number | null,
    previous: number | null,
): Comparison {
    if (current === null || previous === null) {
        return { available: false, reason: "No rate with zero income" };
    }
    const comparison = compareValues(current, previous);
    return comparison.available ? { ...comparison, percentage: null } : comparison;
}

export function monthlyActivityComparison(
    transactions: FinanceTransaction[],
    today: Date,
) {
    const periods = equivalentElapsedPeriods(today);
    const current = activityInPeriod(
        transactions,
        periods.currentStart,
        periods.currentEnd,
    );
    const previous = activityInPeriod(
        transactions,
        periods.previousStart,
        periods.previousEnd,
    );
    return {
        periods,
        current,
        previous,
        income: compareValues(current.income, previous.income),
        expenses: compareValues(current.expenses, previous.expenses, true),
        netCashFlow: compareValues(current.netCashFlow, previous.netCashFlow),
        savingsRate: comparePercentagePoints(current.savingsRate, previous.savingsRate),
    };
}

export function overallPositionComparison(
    current: { bank: number; investments: number; debt: number; netWorth: number },
    history: FinancialPositionSnapshot[] | undefined,
    today: Date,
) {
    const cutoff = equivalentElapsedPeriods(today).previousMonthEndCutoff;
    let previous: FinancialPositionSnapshot | undefined;
    for (const snapshot of history ?? []) {
        if (snapshot.recordedAt < cutoff &&
            (!previous || snapshot.recordedAt >= previous.recordedAt)) {
            previous = snapshot;
        }
    }
    const reason = history?.length && history.every((snapshot) => snapshot.recordedAt >= cutoff)
        ? "Tracking started this month"
        : "No previous-period data";

    return {
        bank: compareValues(current.bank, previous?.bank ?? null, false, reason),
        investments: compareValues(current.investments, previous?.investments ?? null, false, reason),
        debt: compareValues(current.debt, previous?.debt ?? null, true, reason),
        netWorth: compareValues(
            current.netWorth,
            previous ? previous.bank + previous.investments - previous.debt : null,
            false,
            reason,
        ),
    };
}
