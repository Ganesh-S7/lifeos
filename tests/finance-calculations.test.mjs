import assert from "node:assert/strict";
import test from "node:test";
import {
    accountBalance,
    categorySpending,
    financialSnapshot,
    investmentValue,
    monthlyActivity,
} from "../src/features/finance/utils/finance-calculations.ts";

const snapshotAt = "2026-10-01T00:00:00.000Z";
const recordedAt = "2026-10-11T00:00:00.000Z";
const account = (id, balance) => ({ id, name: id, balanceSnapshot: balance, balanceSnapshotAt: snapshotAt });
const transaction = (id, type, amount, extra = {}) => ({
    id, type, amount, description: id, date: "2026-10-11", recordedAt, ...extra,
});

test("income, expense and transfer update accounts without inflating cash flow", () => {
    const everyday = account("everyday", 25000);
    const savings = account("savings", 100000);
    const income = transaction("salary", "income", 45000, { accountId: everyday.id });
    const expense = transaction("food", "expense", 500, { accountId: everyday.id, category: "Food" });
    const transfer = transaction("move", "transfer", 10000, {
        accountId: everyday.id, destinationAccountId: savings.id,
    });
    const entries = [income, expense, transfer];
    assert.equal(accountBalance(everyday, entries), 59500);
    assert.equal(accountBalance(savings, entries), 110000);
    assert.equal(accountBalance(everyday, entries) + accountBalance(savings, entries), 169500);
    assert.deepEqual(monthlyActivity(entries, "2026-10"), {
        income: 45000, expenses: 500, netCashFlow: 44500,
        savingsRate: 44500 / 45000 * 100,
    });
    assert.deepEqual(categorySpending(entries, "2026-10"), [{ category: "Food", amount: 500 }]);
});

test("investment trades affect bank and tracked value but not ordinary activity", () => {
    const bank = account("bank", 10000);
    const investment = { id: "crypto", valuationSnapshot: 1000, valuationSnapshotAt: snapshotAt };
    const purchase = transaction("buy", "investment_purchase", 2000, {
        accountId: bank.id, investmentId: investment.id,
    });
    const sale = transaction("sell", "investment_sale", 500, {
        accountId: bank.id, investmentId: investment.id,
    });
    assert.equal(accountBalance(bank, [purchase, sale]), 8500);
    assert.equal(investmentValue(investment, [purchase, sale]), 2500);
    assert.equal(monthlyActivity([purchase, sale], "2026-10").expenses, 0);
    assert.equal(monthlyActivity([purchase, sale], "2026-10").income, 0);
    assert.equal(accountBalance(bank, [purchase]), 8000);
    assert.equal(accountBalance(bank, []), 10000);
});

test("editing, deletion and fresh snapshots do not double count old entries", () => {
    const bank = account("bank", 5000);
    const expense = transaction("expense", "expense", 100, { accountId: bank.id });
    assert.equal(accountBalance(bank, [expense]), 4900);
    assert.equal(accountBalance(bank, [{ ...expense, amount: 200 }]), 4800);
    assert.equal(accountBalance(bank, []), 5000);
    assert.equal(accountBalance({ ...bank, balanceSnapshot: 7000, balanceSnapshotAt: "2026-10-12T00:00:00.000Z" }, [expense]), 7000);
    const demo = transaction("demo", "expense", 400, {
        recordedAt: "2026-09-01T00:00:00.000Z", demoAccount: "Old account",
    });
    assert.equal(accountBalance(bank, [demo]), 5000);
});

test("net worth and zero income are derived safely", () => {
    const data = {
        accounts: [account("bank", 25000)],
        investments: [{ id: "crypto", valuationSnapshot: 10000, valuationSnapshotAt: snapshotAt }],
        liabilities: [{ balance: 5000 }],
        transactions: [],
    };
    assert.equal(financialSnapshot(data).netWorth, 30000);
    assert.equal(monthlyActivity([], "2026-10").savingsRate, null);
    assert.deepEqual(categorySpending([], "2026-10"), []);
});
