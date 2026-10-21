import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { buildFinanceChartData } = await import("../src/features/finance/utils/finance-chart-data.ts");
const empty = () => ({ accounts: [], investments: [], liabilities: [], transactions: [], positionHistory: [] });
const today = new Date(2026, 9, 20, 12);
const position = (month, day, bank, investments = 0, debt = 0) => ({
    recordedAt: new Date(2026, month, day, 12).toISOString(), bank, investments, debt,
});
const transaction = (type, amount, date, extra = {}) => ({
    id: `${type}-${date}`, type, amount, date, description: type,
    recordedAt: new Date(2026, 9, 10).toISOString(), accountId: "bank", ...extra,
});

test("empty API collections produce no fabricated positions, income or expenses", () => {
    const data = empty();
    const points = buildFinanceChartData(data, today);
    assert.equal(points.length, 6);
    assert.ok(points.every((point) => point.netWorth === null && point.income === 0 && point.expenses === 0));
    assert.deepEqual(data, empty());
});

test("past points use only the latest actual snapshot in each local calendar month", () => {
    const data = empty();
    data.positionHistory = [position(7, 28, 300, 50, 100), position(7, 2, 900), position(9, 25, 9999)];
    const points = buildFinanceChartData(data, today);
    assert.equal(points[3].netWorth, 250);
    assert.equal(points[0].netWorth, null);
    assert.equal(points[1].netWorth, null);
    assert.equal(points[2].netWorth, null);
    assert.equal(points[4].netWorth, null);
    assert.equal(points[5].netWorth, 0);
    assert.equal(data.positionHistory.length, 3);
});

test("empty position history leaves past months unavailable while current real balances remain visible", () => {
    const data = empty();
    data.accounts = [{ id: "bank", balanceSnapshot: 1000, balanceSnapshotAt: "2026-10-01T00:00:00.000Z" }];
    data.transactions = [transaction("income", 500, "2026-10-10"), transaction("expense", 100, "2026-10-10")];
    const points = buildFinanceChartData(data, today);
    assert.ok(points.slice(0, 5).every((point) => point.netWorth === null));
    assert.equal(points[5].netWorth, 1400);
    assert.deepEqual(data.positionHistory, []);
});

test("month boundaries use local time and missing months are not filled forward", () => {
    const data = empty();
    data.positionHistory = [{
        recordedAt: new Date(2026, 8, 1).toISOString(), bank: 120, investments: 10, debt: 50,
    }];
    const points = buildFinanceChartData(data, today);
    assert.equal(points[3].netWorth, null);
    assert.equal(points[4].netWorth, 80);
});

test("cash flow derives recorded ordinary transactions and preserves current through-today boundaries", () => {
    const data = empty();
    data.transactions = [
        transaction("income", 1000, "2026-09-12"),
        transaction("expense", 100, "2026-09-12"),
        transaction("income", 2000, "2026-10-12"),
        transaction("expense", 200, "2026-10-12"),
        transaction("transfer", 300, "2026-10-12", { destinationAccountId: "savings" }),
        transaction("investment_purchase", 400, "2026-10-12", { investmentId: "holding" }),
        transaction("investment_sale", 50, "2026-10-12", { investmentId: "holding" }),
        transaction("expense", 9999, "2026-10-21"),
    ];
    const points = buildFinanceChartData(data, today);
    assert.equal(points[4].income, 1000);
    assert.equal(points[4].expenses, 100);
    assert.equal(points[5].income, 2000);
    assert.equal(points[5].expenses, 200);
    assert.ok(points.slice(0, 4).every((point) => point.income === 0 && point.expenses === 0));
});
