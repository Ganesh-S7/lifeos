import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { accountBalance } from "../src/features/finance/utils/finance-calculations.ts";

test("actual transaction actions preserve recordedAt across edits and snapshot replacement", async () => {
    const bank = {
        id: "test-bank", name: "Test account", balanceSnapshot: 5000,
        balanceSnapshotAt: "2020-01-01T00:00:00.000Z",
        createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z",
    };
    const recordedAt = "2020-02-01T00:00:00.000Z";
    let storedValue = JSON.stringify({
        accounts: [bank], investments: [], liabilities: [],
        transactions: [{
            id: "test-income", type: "income", amount: 1000, description: "Original",
            date: "2020-02-01", recordedAt, accountId: bank.id,
        }],
        positionHistory: [{ recordedAt, bank: 6000, investments: 0, debt: 0 }],
    });
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    // Isolated in-memory fake: no browser storage, database, or real records are accessed.
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            localStorage: {
                getItem(key) {
                    assert.equal(key, "lifeos-finance-v1");
                    return storedValue;
                },
                setItem(key, value) {
                    assert.equal(key, "lifeos-finance-v1");
                    storedValue = value;
                },
            },
        },
    });
    try {
        const { financeActions } = await import("../src/features/finance/store/finance-store.ts");
        financeActions.saveTransaction({
            id: "test-income", type: "income", amount: 3000, description: "Edited",
            date: "2019-12-31", accountId: bank.id,
        });
        let state = JSON.parse(storedValue);
        assert.equal(state.transactions[0].recordedAt, recordedAt);
        assert.equal(state.transactions[0].date, "2019-12-31");
        assert.equal(accountBalance(state.accounts[0], state.transactions), 8000);
        financeActions.saveAccount({ id: bank.id, name: bank.name, balance: 8000 });
        state = JSON.parse(storedValue);
        assert.equal(state.transactions.length, 1);
        assert.equal(state.transactions[0].recordedAt, recordedAt);
        assert.equal(accountBalance(state.accounts[0], state.transactions), 8000);
        financeActions.saveTransaction({
            id: "test-income", type: "income", amount: 4000, description: "Edited again",
            date: "2019-12-31", accountId: bank.id,
        });
        state = JSON.parse(storedValue);
        assert.equal(state.transactions[0].recordedAt, recordedAt);
        assert.equal(accountBalance(state.accounts[0], state.transactions), 8000);
        financeActions.deleteTransaction("test-income");
        state = JSON.parse(storedValue);
        assert.equal(state.transactions.length, 0);
        assert.equal(accountBalance(state.accounts[0], state.transactions), 8000);
    } finally {
        if (previousWindow) {
            Object.defineProperty(globalThis, "window", previousWindow);
        } else {
            delete globalThis.window;
        }
    }
});
