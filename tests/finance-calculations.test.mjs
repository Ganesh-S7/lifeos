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
    const historical = transaction("historical", "expense", 400, {
        recordedAt: "2026-09-01T00:00:00.000Z",
    });
    assert.equal(accountBalance(bank, [historical]), 5000);
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

test("snapshot cutoffs use strict recording-time order rather than transaction dates", () => {
    const bank = account("bank", 1000);
    const entries = [
        transaction("before", "income", 9000, {
            accountId: bank.id,
            recordedAt: "2026-09-30T23:59:59.999Z",
        }),
        transaction("equal", "expense", 100, {
            accountId: bank.id,
            recordedAt: snapshotAt,
        }),
        transaction("later-backdated", "income", 200, {
            accountId: bank.id,
            recordedAt: "2026-10-01T00:00:00.001Z",
            date: "2026-09-01",
        }),
        transaction("unrelated", "income", 500, { accountId: "other-bank" }),
    ];
    assert.equal(accountBalance(bank, entries), 1200);
    assert.equal(bank.balanceSnapshot, 1000);
    assert.equal(monthlyActivity(entries, "2026-09").income, 200);
});

test("investment snapshots exclude earlier and equal-time trades and unrelated holdings", () => {
    const holding = {
        id: "holding", valuationSnapshot: 1000, valuationSnapshotAt: snapshotAt,
    };
    const entries = [
        transaction("earlier-buy", "investment_purchase", 500, {
            investmentId: holding.id,
            recordedAt: "2026-09-30T23:59:59.999Z",
        }),
        transaction("equal-sale", "investment_sale", 100, {
            investmentId: holding.id,
            recordedAt: snapshotAt,
        }),
        transaction("later-buy", "investment_purchase", 200, {
            investmentId: holding.id,
            recordedAt: "2026-10-01T00:00:00.001Z",
            date: "2026-09-01",
        }),
        transaction("other-buy", "investment_purchase", 9000, { investmentId: "other" }),
    ];
    assert.equal(investmentValue(holding, entries), 1200);
    assert.equal(holding.valuationSnapshot, 1000);
});

test("trades and transfers preserve ordinary cash flow and savings-rate inputs", () => {
    const ordinary = [
        transaction("income", "income", 1000),
        transaction("expense", "expense", 250, { category: "Bills" }),
    ];
    const entries = [
        ...ordinary,
        transaction("transfer", "transfer", 3000),
        transaction("purchase", "investment_purchase", 2000),
        transaction("sale", "investment_sale", 1500),
    ];
    assert.deepEqual(monthlyActivity(entries, "2026-10"), {
        income: 1000, expenses: 250, netCashFlow: 750, savingsRate: 75,
    });
    assert.deepEqual(categorySpending(entries, "2026-10"), [{ category: "Bills", amount: 250 }]);
});

test("purchases and sales move value between financial assets without changing net worth", () => {
    const bank = account("bank", 10000);
    const holding = {
        id: "holding", valuationSnapshot: 5000, valuationSnapshotAt: snapshotAt,
    };
    const data = {
        accounts: [bank], investments: [holding], liabilities: [{ balance: 1000 }],
        transactions: [],
    };
    const trades = [
        transaction("purchase", "investment_purchase", 2000, {
            accountId: bank.id, investmentId: holding.id,
        }),
        transaction("sale", "investment_sale", 500, {
            accountId: bank.id, investmentId: holding.id,
        }),
    ];
    assert.equal(financialSnapshot(data).netWorth, 14000);
    assert.deepEqual(financialSnapshot({ ...data, transactions: trades }), {
        bank: 8500, investments: 6500, debt: 1000, netWorth: 14000,
    });
});

test("replacement valuations and account snapshots have independent cutoffs", () => {
    const bank = {
        ...account("bank", 8000), balanceSnapshotAt: "2026-10-12T00:00:00.000Z",
    };
    const holding = {
        id: "holding", valuationSnapshot: 1000, valuationSnapshotAt: snapshotAt,
    };
    const purchase = transaction("purchase", "investment_purchase", 2000, {
        accountId: bank.id, investmentId: holding.id,
    });
    assert.equal(accountBalance(bank, [purchase]), 8000);
    assert.equal(investmentValue(holding, [purchase]), 3000);
    const revalued = { ...holding, valuationSnapshot: 3500, valuationSnapshotAt: bank.balanceSnapshotAt };
    assert.equal(investmentValue(revalued, [purchase]), 3500);
    assert.equal(investmentValue(revalued, [{ ...purchase, amount: 2500 }]), 3500);
    assert.equal(investmentValue(revalued, []), 3500);
});

test("editing and deleting transfers recalculates each referenced account", () => {
    const source = account("source", 1000);
    const destination = account("destination", 100);
    const other = account("other", 200);
    const transfer = transaction("transfer", "transfer", 300, {
        accountId: source.id, destinationAccountId: destination.id,
    });
    assert.equal(accountBalance(source, [transfer]), 700);
    assert.equal(accountBalance(destination, [transfer]), 400);
    const edited = { ...transfer, amount: 400, destinationAccountId: other.id };
    assert.equal(accountBalance(source, [edited]), 600);
    assert.equal(accountBalance(destination, [edited]), 100);
    assert.equal(accountBalance(other, [edited]), 600);
    assert.equal(accountBalance(source, []), 1000);
    assert.equal(accountBalance(other, []), 200);
});

test("characterization: future-dated entries affect ledgers when recorded and whole-month totals", () => {
    const bank = account("bank", 1000);
    const future = transaction("future", "expense", 100, {
        accountId: bank.id, date: "2026-10-31", category: "Bills",
    });
    assert.equal(accountBalance(bank, [future]), 900);
    assert.equal(monthlyActivity([future], "2026-10").expenses, 100);
    assert.deepEqual(categorySpending([future], "2026-10"), [{ category: "Bills", amount: 100 }]);
});

test("characterization: existing ledger arithmetic does not round fractional numbers", () => {
    const bank = account("bank", 0);
    const entries = [
        transaction("first", "income", 0.1, { accountId: bank.id }),
        transaction("second", "income", 0.2, { accountId: bank.id }),
    ];
    assert.equal(accountBalance(bank, entries), 0.1 + 0.2);
    assert.notEqual(accountBalance(bank, entries), 0.3);
});
