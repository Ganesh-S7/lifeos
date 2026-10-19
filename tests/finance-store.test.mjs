import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const { createFinanceStore, emptyFinanceData } = await import("../src/features/finance/store/finance-store-core.ts");
import { transactionsToExpenses, expenseToTransaction } from "../src/features/finance/utils/expense-transactions.ts";
import { createFinanceMutation } from "../src/features/finance/utils/finance-mutation.ts";
import { accountBalance } from "../src/features/finance/utils/finance-calculations.ts";

const time = "2026-01-01T00:00:00.000Z";
const bank = {
    id: "bank", name: "Everyday", balanceSnapshot: 5000, balanceSnapshotAt: time,
    createdAt: time, updatedAt: time,
};
const investment = {
    id: "investment", name: "Holding", type: "Cryptocurrency", valuationSnapshot: 100,
    valuationSnapshotAt: time, createdAt: time, updatedAt: time,
};
const liability = {
    id: "liability", name: "Loan", type: "Bike", balance: 200, createdAt: time, updatedAt: time,
};
const transaction = {
    id: "transaction", type: "income", amount: 1000, description: "Salary",
    accountId: bank.id, date: "2026-01-02", recordedAt: "2026-01-02T01:00:00.000Z",
};
const history = { id: "history", recordedAt: time, bank: 5000, investments: 100, debt: 200 };
const fullData = () => ({
    accounts: [bank], investments: [investment], liabilities: [liability],
    transactions: [transaction], positionHistory: [history],
});
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(data = emptyFinanceData()) {
    const calls = [];
    const api = { async getFinanceData() { calls.push(["getFinanceData"]); return data; } };
    for (const [kind, key] of [
        ["Account", "accounts"], ["Investment", "investments"],
        ["Liability", "liabilities"], ["Transaction", "transactions"],
    ]) {
        for (const operation of ["create", "update", "delete"]) {
            const method = `${operation}${kind}`;
            api[method] = async (...args) => {
                calls.push([method, ...args]);
                const id = operation === "create" ? `${key}-new` : args[0];
                const body = args[operation === "create" ? 0 : 1];
                if (operation === "delete") {
                    data = { ...data, [key]: data[key].filter((item) => item.id !== id) };
                    return;
                }
                const record = { id, ...body, createdAt: time, updatedAt: time };
                if (kind === "Account") {
                    record.balanceSnapshot = body.balance;
                    record.balanceSnapshotAt = time;
                    delete record.balance;
                }
                if (kind === "Investment") {
                    record.valuationSnapshot = body.value;
                    record.valuationSnapshotAt = time;
                    delete record.value;
                }
                if (kind === "Transaction") {
                    record.recordedAt = data.transactions.find((item) => item.id === id)?.recordedAt ?? time;
                }
                data = {
                    ...data,
                    [key]: [...data[key].filter((item) => item.id !== id), record],
                    positionHistory: [...data.positionHistory, { ...history, id: `history-${calls.length}` }],
                };
                return record;
            };
        }
    }
    return { api, calls, store: createFinanceStore(api), data: () => data };
}

test("initialization populates all five collections and deduplicates concurrent consumers", async () => {
    const { store, calls } = fixture(fullData());
    let notifications = 0;
    const unsubscribe = store.subscribe(() => notifications++);
    await Promise.all([store.setSession("user"), store.setSession("user"), store.setSession("user")]);
    assert.deepEqual(store.getSnapshot().data, fullData());
    assert.equal(store.getSnapshot().ready, true);
    assert.equal(calls.length, 1);
    assert.ok(notifications > 0);
    unsubscribe();
    await store.setSession("user");
    assert.equal(calls.length, 1);
});

test("empty API data remains genuinely empty with no baseline or demo data", async () => {
    const { store } = fixture();
    assert.deepEqual(store.getSnapshot().data, emptyFinanceData());
    assert.equal(store.getSnapshot().ready, false);
    await store.setSession("user");
    assert.deepEqual(store.getSnapshot().data, emptyFinanceData());
    assert.equal(store.getSnapshot().ready, true);
});

test("initial failure remains unready until explicit retry succeeds", async () => {
    const { store, api } = fixture(fullData());
    const read = api.getFinanceData;
    api.getFinanceData = async () => { throw new Error("Read unavailable"); };
    await store.setSession("user");
    assert.equal(store.getSnapshot().ready, false);
    assert.equal(store.getSnapshot().loadError, "Read unavailable");
    await store.setSession("user");
    assert.equal(store.getSnapshot().loadError, "Read unavailable");
    api.getFinanceData = read;
    await store.retry();
    assert.equal(store.getSnapshot().ready, true);
    assert.equal(store.getSnapshot().loadError, "");
    assert.deepEqual(store.getSnapshot().data, fullData());
});

test("sign-out clears data and switching users rejects stale reads", async () => {
    const { store, api } = fixture(fullData());
    await store.setSession("first");
    await store.setSession(null);
    assert.equal(store.getSnapshot().ready, false);
    assert.deepEqual(store.getSnapshot().data, emptyFinanceData());
    const oldRead = deferred();
    api.getFinanceData = () => oldRead.promise;
    const first = store.setSession("first");
    await tick();
    api.getFinanceData = async () => emptyFinanceData();
    const second = store.setSession("second");
    assert.deepEqual(store.getSnapshot().data, emptyFinanceData());
    await second;
    oldRead.resolve(fullData());
    await first;
    assert.equal(store.getSnapshot().userId, "second");
    assert.deepEqual(store.getSnapshot().data, emptyFinanceData());
});

for (const [kind, key, input, record] of [
    ["Account", "accounts", { name: "Everyday", balance: 5000 }, bank],
    ["Investment", "investments", { name: "Holding", type: "Cryptocurrency", value: 100 }, investment],
    ["Liability", "liabilities", { name: "Loan", type: "Bike", balance: 200 }, liability],
    ["Transaction", "transactions", {
        type: "income", amount: 1000, description: "Salary", date: "2026-01-02", accountId: "bank",
    }, transaction],
]) {
    for (const operation of ["create", "update", "delete"]) {
        test(`${operation} ${kind} uses API, retains returned DTO and refreshes authoritative history`, async () => {
            const { store, calls, data } = fixture(fullData());
            await store.setSession("user");
            if (operation === "delete") await store.actions[`delete${kind}`](record.id);
            else await store.actions[`save${kind}`]({ ...input, ...(operation === "update" ? { id: record.id } : {}) });
            assert.equal(calls[1][0], `${operation}${kind}`);
            if (operation !== "create") assert.equal(calls[1][1], record.id);
            assert.equal(calls[2][0], "getFinanceData");
            assert.deepEqual(store.getSnapshot().data, data());
            if (operation === "delete") assert.equal(store.getSnapshot().data[key].length, 0);
            else assert.equal(store.getSnapshot().data.positionHistory.length, 2);
        });

        test(`failed ${operation} ${kind} never changes loaded records or history`, async () => {
            const { store, api } = fixture(fullData());
            await store.setSession("user");
            const before = store.getSnapshot().data;
            const response = deferred();
            api[`${operation}${kind}`] = () => response.promise;
            const request = operation === "delete"
                ? store.actions[`delete${kind}`](record.id)
                : store.actions[`save${kind}`]({
                    ...input,
                    ...(operation === "update" ? { id: record.id } : {}),
                });
            await tick();
            assert.equal(store.getSnapshot().data, before);
            response.reject(new Error("Server rejected this change"));
            await assert.rejects(request, /Server rejected this change/);
            assert.equal(store.getSnapshot().data, before);
        });
    }
}

for (const type of ["income", "expense", "transfer", "investment_purchase", "investment_sale"]) {
    test(`${type} create/edit/delete routes the correct relationship fields and server timestamps`, async () => {
        const { store, calls } = fixture(fullData());
        await store.setSession("user");
        const input = {
            type, amount: 10, description: "Transaction", date: "2026-01-02", accountId: "bank",
            category: "Food", destinationAccountId: "savings", investmentId: "investment",
        };
        await store.actions.saveTransaction(input);
        const body = calls[1][1];
        assert.equal(body.type, type);
        assert.equal(body.destinationAccountId, type === "transfer" ? "savings" : undefined);
        assert.equal(body.investmentId, type.startsWith("investment_") ? "investment" : undefined);
        assert.equal(body.category, type === "expense" || type === "income" ? "Food" : undefined);
        await store.actions.saveTransaction({ ...input, id: transaction.id, date: "2025-12-31" });
        const edited = store.getSnapshot().data.transactions.find((item) => item.id === transaction.id);
        assert.equal(edited.recordedAt, transaction.recordedAt);
        assert.equal(edited.date, "2025-12-31");
        await store.actions.deleteTransaction(transaction.id);
        assert.equal(store.getSnapshot().data.transactions.some((item) => item.id === transaction.id), false);
    });
}

test("no optimistic update; failed write retains exact state and useful error", async () => {
    const { store, api } = fixture(fullData());
    await store.setSession("user");
    const original = store.getSnapshot().data;
    const write = deferred();
    api.updateAccount = () => write.promise;
    const saving = store.actions.saveAccount({ id: "bank", name: "Changed", balance: 7000 });
    await tick();
    assert.equal(store.getSnapshot().data, original);
    write.reject(new Error("Insufficient funds"));
    await assert.rejects(saving, /Insufficient funds/);
    assert.equal(store.getSnapshot().data, original);
});

test("successful write with failed refresh retains returned record and loaded content; retry recovers history", async () => {
    const { store, api, data } = fixture(fullData());
    await store.setSession("user");
    const read = api.getFinanceData;
    api.getFinanceData = async () => { throw new Error("Offline"); };
    await store.actions.saveAccount({ id: "bank", name: "Updated", balance: 9000 });
    const state = store.getSnapshot();
    assert.equal(state.ready, true);
    assert.equal(state.data.accounts[0].balanceSnapshot, 9000);
    assert.deepEqual(state.data.transactions, fullData().transactions);
    assert.equal(state.data.positionHistory.length, 1);
    assert.match(state.refreshError, /saved changes are retained.*Offline/);
    api.getFinanceData = read;
    await store.retry();
    assert.equal(store.getSnapshot().refreshError, "");
    assert.deepEqual(store.getSnapshot().data, data());
    assert.equal(store.getSnapshot().data.positionHistory.length, 2);
    assert.equal(accountBalance(state.data.accounts[0], state.data.transactions), 10000);
});

test("confirmed delete remains removed when refresh fails", async () => {
    const { store, api } = fixture(fullData());
    await store.setSession("user");
    api.getFinanceData = async () => { throw new Error("Read unavailable"); };
    await store.actions.deleteTransaction(transaction.id);
    assert.deepEqual(store.getSnapshot().data.transactions, []);
    assert.equal(store.getSnapshot().data.accounts.length, 1);
    assert.equal(store.getSnapshot().ready, true);
    assert.match(store.getSnapshot().refreshError, /Read unavailable/);
});

test("stale in-flight mutations and queued operations cannot change a newer session", async () => {
    const { store, api } = fixture(fullData());
    await store.setSession("first");
    const write = deferred();
    api.updateAccount = () => write.promise;
    const saving = store.actions.saveAccount({ id: "bank", name: "Old user", balance: 7000 });
    const queued = store.actions.deleteAccount("bank");
    const assertions = [assert.rejects(saving, /session changed/), assert.rejects(queued, /session changed/)];
    await tick();
    api.getFinanceData = async () => emptyFinanceData();
    await store.setSession("second");
    write.resolve({ ...bank, name: "Old user" });
    await Promise.all(assertions);
    assert.deepEqual(store.getSnapshot().data, emptyFinanceData());
    assert.equal(store.getSnapshot().userId, "second");
});

test("concurrent writes and retry reads serialize without losing newer state", async () => {
    const { store, api, data } = fixture(fullData());
    await store.setSession("user");
    const original = api.updateAccount;
    const gate = deferred();
    api.updateAccount = async (...args) => { await gate.promise; return original(...args); };
    const first = store.actions.saveAccount({ id: "bank", name: "First", balance: 5000 });
    const retry = store.retry();
    const second = store.actions.saveAccount({ id: "bank", name: "Second", balance: 6000 });
    gate.resolve();
    await Promise.all([first, retry, second]);
    assert.deepEqual(store.getSnapshot().data, data());
    assert.equal(store.getSnapshot().data.accounts[0].name, "Second");
    assert.equal(store.getSnapshot().data.positionHistory.length, 3);
});

test("invalid inputs fail before API calls and uninitialized writes are blocked", async () => {
    const { store, calls } = fixture();
    await assert.rejects(store.actions.saveAccount({ name: "Bank", balance: 10 }), /not ready/);
    await store.setSession("user");
    await assert.rejects(store.actions.saveAccount({ name: "Bank", balance: -1 }));
    await assert.rejects(store.actions.saveTransaction({ ...transaction, amount: 0 }));
    await assert.rejects(store.actions.saveTransaction({ ...transaction, accountId: undefined }));
    await assert.rejects(store.actions.saveTransaction({ ...transaction, type: "transfer", destinationAccountId: "bank" }));
    assert.equal(calls.length, 1);
});

test("expense projection and async form callback preserve IDs, merchant, account ID, dates and success semantics", async () => {
    const { store, api } = fixture(fullData());
    await store.setSession("user");
    const feedback = { successes: 0, errors: 0 };
    const coordinator = createFinanceMutation(() => { });
    const saveExpense = async (expense) => {
        try {
            await store.actions.saveTransaction(expenseToTransaction(expense));
            return true;
        } catch {
            return false;
        }
    };
    const expense = {
        id: "", merchant: "Groceries", category: "Food", account: "bank", amount: 50,
        date: "2026-01-02", note: "Weekly",
    };
    const handlers = {
        onSuccess() { feedback.successes++; },
        onError() { feedback.errors++; },
    };
    assert.equal(await coordinator.run(() => saveExpense(expense), handlers), true);
    const projection = transactionsToExpenses(store.getSnapshot().data.transactions);
    assert.equal(projection.length, 1);
    assert.deepEqual(projection[0], { ...expense, id: "transactions-new" });
    assert.equal(await saveExpense({ ...projection[0], merchant: "Edited", date: "2025-12-31" }), true);
    assert.equal(transactionsToExpenses(store.getSnapshot().data.transactions)[0].merchant, "Edited");
    assert.equal(store.getSnapshot().data.transactions.length, 2);
    api.updateTransaction = async () => { throw new Error("Server rejected expense"); };
    assert.equal(await coordinator.run(() => saveExpense(projection[0]), handlers), false);
    assert.equal(feedback.successes, 1);
    await store.actions.deleteTransaction(projection[0].id);
    assert.deepEqual(transactionsToExpenses(store.getSnapshot().data.transactions), []);
});

test("Finance runtime has no storage, demo seed, or locally fabricated history dependencies", () => {
    for (const file of ["finance-store.ts", "finance-store-core.ts"]) {
        const source = readFileSync(new URL(`../src/features/finance/store/${file}`, import.meta.url), "utf8");
        assert.doesNotMatch(source, /localStorage|lifeos-finance-v1|mock-expenses|randomUUID|financialSnapshot/);
    }
});

test("initialization, retry and CRUD never access legacy browser storage", async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
    let storageAccesses = 0;
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            get localStorage() {
                storageAccesses++;
                throw new Error("Legacy storage must not be accessed");
            },
            get sessionStorage() {
                storageAccesses++;
                throw new Error("Browser storage must not be accessed");
            },
        },
    });
    try {
        const { store } = fixture();
        await store.setSession("user");
        assert.deepEqual(store.getSnapshot().data, emptyFinanceData());
        await store.retry();
        await store.actions.saveAccount({ name: "My account", balance: 10 });
        await store.actions.deleteAccount("accounts-new");
        await store.setSession(null);
        assert.equal(storageAccesses, 0);
    } finally {
        if (previous) Object.defineProperty(globalThis, "window", previous);
        else delete globalThis.window;
    }
});
