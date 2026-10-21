import assert from "node:assert/strict";
import test from "node:test";
import {
    activityInPeriod,
    compareValues,
    equivalentElapsedPeriods,
    monthlyActivityComparison,
    overallPositionComparison,
} from "../src/features/finance/utils/finance-comparisons.ts";
import { financialSnapshot } from "../src/features/finance/utils/finance-calculations.ts";

const today = new Date(2026, 9, 11, 12);
const previousSnapshot = {
    recordedAt: new Date(2026, 8, 30, 20).toISOString(),
    bank: 10000,
    investments: 3000,
    debt: 5000,
};
const transaction = (type, amount, date) => ({
    id: `${type}-${date}-${amount}`,
    type,
    amount,
    date,
    description: type,
    recordedAt: `${date}T12:00:00.000Z`,
});

test("overall values use the last actual position before month end", () => {
    const later = { ...previousSnapshot, recordedAt: new Date(2026, 9, 2).toISOString(), bank: 99999 };
    const current = { bank: 12000, investments: 2500, debt: 4000, netWorth: 10500 };
    const results = overallPositionComparison(current, [previousSnapshot, later], today);
    assert.equal(results.bank.change, 2000);
    assert.equal(results.bank.tone, "positive");
    assert.equal(results.investments.change, -500);
    assert.equal(results.investments.tone, "negative");
    assert.equal(results.debt.change, -1000);
    assert.equal(results.debt.tone, "positive");
    assert.equal(results.netWorth.change, 2500);
    assert.equal(results.netWorth.tone, "positive");
    assert.deepEqual(current, { bank: 12000, investments: 2500, debt: 4000, netWorth: 10500 });
    assert.equal(previousSnapshot.bank, 10000);
});

test("declines and inverse expense/debt interpretation are correct", () => {
    assert.equal(compareValues(8000, 10000).tone, "negative");
    assert.equal(compareValues(6000, 5000, true).tone, "negative");
    assert.equal(compareValues(400, 500, true).tone, "positive");
    assert.equal(compareValues(500, 500, true).direction, "unchanged");
});

test("zero baselines never produce invalid percentages", () => {
    const increased = compareValues(3500, 0);
    assert.equal(increased.absoluteChange, 3500);
    assert.equal(increased.percentage, null);
    assert.equal(compareValues(0, 0).direction, "unchanged");
});

test("equivalent elapsed periods clamp shorter months and cross years", () => {
    assert.deepEqual(equivalentElapsedPeriods(today).currentEnd, "2026-10-11");
    assert.deepEqual(equivalentElapsedPeriods(today).previousEnd, "2026-09-11");
    assert.equal(equivalentElapsedPeriods(new Date(2026, 2, 31, 12)).previousEnd, "2026-02-28");
    assert.equal(equivalentElapsedPeriods(new Date(2024, 2, 31, 12)).previousEnd, "2024-02-29");
    assert.equal(equivalentElapsedPeriods(new Date(2026, 0, 11, 12)).previousStart, "2025-12-01");
});

test("monthly comparison uses matched partial periods and excludes future dates", () => {
    const entries = [
        transaction("income", 1200, "2026-10-11"),
        transaction("expense", 200, "2026-10-11"),
        transaction("income", 9000, "2026-10-12"),
        transaction("income", 1000, "2026-09-11"),
        transaction("expense", 300, "2026-09-11"),
        transaction("expense", 999, "2026-09-12"),
        transaction("transfer", 500, "2026-10-11"),
        transaction("investment_purchase", 100, "2026-10-11"),
        transaction("investment_sale", 100, "2026-10-11"),
    ];
    const result = monthlyActivityComparison(entries, today);
    assert.equal(result.current.income, 1200);
    assert.equal(result.current.expenses, 200);
    assert.equal(result.previous.income, 1000);
    assert.equal(result.previous.expenses, 300);
    assert.equal(result.income.change, 200);
    assert.equal(result.expenses.change, -100);
    assert.equal(result.expenses.tone, "positive");
    assert.equal(result.netCashFlow.change, 300);
    assert.equal(activityInPeriod(entries, "2026-10-01", "2026-10-11").netCashFlow, 1000);
});

test("savings rate change is available in percentage points when both periods have income", () => {
    const entries = [
        transaction("income", 1000, "2026-09-05"),
        transaction("expense", 750, "2026-09-05"),
        transaction("income", 1000, "2026-10-05"),
        transaction("expense", 700, "2026-10-05"),
    ];
    const result = monthlyActivityComparison(entries, today);
    assert.equal(result.previous.savingsRate, 25);
    assert.equal(result.current.savingsRate, 30);
    assert.equal(result.savingsRate.change, 5);
    assert.equal(result.savingsRate.tone, "positive");
});

test("missing real history stays neutral and ignores illustrative chart values", () => {
    const current = { bank: 10000, investments: 2000, debt: 3000, netWorth: 9000 };
    const result = overallPositionComparison(current, [], today);
    assert.deepEqual(result.bank, { available: false, reason: "No previous-period data" });
    const started = overallPositionComparison(current, [{
        recordedAt: new Date(2026, 9, 2).toISOString(),
        bank: 999999,
        investments: 999999,
        debt: 0,
    }], today);
    assert.deepEqual(started.netWorth, { available: false, reason: "Tracking started this month" });
    assert.equal(current.netWorth, 9000);
});

test("historical positions do not change current financial calculations", () => {
    const data = {
        accounts: [{ id: "bank", balanceSnapshot: 5000, balanceSnapshotAt: "2026-10-01T00:00:00.000Z" }],
        investments: [{ id: "investment", valuationSnapshot: 2000, valuationSnapshotAt: "2026-10-01T00:00:00.000Z" }],
        liabilities: [{ balance: 1000 }],
        transactions: [],
        positionHistory: [previousSnapshot],
    };
    assert.deepEqual(financialSnapshot(data), {
        bank: 5000,
        investments: 2000,
        debt: 1000,
        netWorth: 6000,
    });
    assert.equal(data.positionHistory[0].bank, 10000);
});

test("zero income yields no savings-rate comparison", () => {
    const result = monthlyActivityComparison([], today);
    assert.equal(result.current.savingsRate, null);
    assert.deepEqual(result.savingsRate, { available: false, reason: "No rate with zero income" });
});

test("period boundaries are inclusive calendar dates independent of recording timestamps", () => {
    const entries = [
        transaction("income", 100, "2026-09-30"),
        { ...transaction("income", 200, "2026-10-01"), recordedAt: "2026-11-01T00:00:00.000Z" },
        transaction("expense", 50, "2026-10-11"),
        transaction("expense", 999, "2026-10-12"),
    ];
    assert.deepEqual(activityInPeriod(entries, "2026-10-01", "2026-10-11"), {
        income: 200, expenses: 50, netCashFlow: 150, savingsRate: 75,
    });
});

test("previous-position cutoff excludes snapshots exactly at local month start", () => {
    const cutoff = equivalentElapsedPeriods(today).previousMonthEndCutoff;
    const before = new Date(Date.parse(cutoff) - 1).toISOString();
    const current = { bank: 2000, investments: 0, debt: 0, netWorth: 2000 };
    const history = [
        { recordedAt: before, bank: 1000, investments: 0, debt: 0 },
        { recordedAt: cutoff, bank: 9000, investments: 0, debt: 0 },
    ];
    assert.equal(overallPositionComparison(current, history, today).bank.change, 1000);
    assert.equal(equivalentElapsedPeriods(today).currentStart, "2026-10-01");
});
