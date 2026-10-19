import assert from "node:assert/strict";
import { Decimal } from "@prisma/client/runtime/client";

export const userId = "user-a";
export const snapshotAt = new Date("2020-01-01T00:00:00.000Z");
export const firstRecordedAt = new Date("2021-01-01T00:00:00.000Z");

export function bank(id = "bank", overrides = {}) {
    return {
        id, userId, name: "Everyday", balanceSnapshot: new Decimal("100"),
        balanceSnapshotAt: snapshotAt, createdAt: snapshotAt, updatedAt: snapshotAt,
        ...overrides,
    };
}

export function holding(id = "holding", overrides = {}) {
    return {
        id, userId, name: "Holding", type: "Cryptocurrency", valuationSnapshot: new Decimal("100"),
        valuationSnapshotAt: snapshotAt, createdAt: snapshotAt, updatedAt: snapshotAt,
        ...overrides,
    };
}

export function entry(id = "owned", overrides = {}) {
    return {
        id, userId, type: "income", amount: new Decimal("50"), description: "Salary",
        date: new Date("2026-10-01T00:00:00.000Z"), recordedAt: firstRecordedAt,
        accountId: "bank", destinationAccountId: null, investmentId: null,
        category: null, note: null, ...overrides,
    };
}

export function records() {
    return { accounts: [bank()], investments: [], liabilities: [], transactions: [], positionHistory: [] };
}

// Staged in-memory writes test the transaction callback's orchestration, not MySQL
// rollback, concurrent clients, FK enforcement or Serializable locking.
export function database(initial = records(), settings = {}) {
    let committed = initial;
    const calls = [];
    const options = [];
    let serial = 0;
    return {
        calls,
        options,
        get records() {
            return committed;
        },
        client: {
            async $transaction(callback, configuration) {
                options.push(configuration);
                const staged = Object.fromEntries(Object.entries(committed).map(([key, rows]) =>
                    [key, rows.map((row) => ({ ...row }))]));
                const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
                function log(method, query) {
                    calls.push({ method, query });
                    if (settings.failAt === method) {
                        throw Object.assign(new Error("PRIVATE_DATABASE_DIAGNOSTIC"), { code: settings.errorCode });
                    }
                }
                const tx = {};
                for (const [model, collection] of [
                    ["bankAccount", "accounts"], ["investment", "investments"],
                    ["liability", "liabilities"], ["financeTransaction", "transactions"],
                ]) {
                    tx[model] = {
                        async findMany(query) {
                            log(`${model}.findMany`, query);
                            assert.deepEqual(query.where, { userId });
                            return staged[collection].filter((row) => matches(row, query.where));
                        },
                    };
                }
                tx.bankAccount.findFirst = async (query) => {
                    log("bankAccount.findFirst", query);
                    assert.equal(query.where.userId, userId);
                    return staged.accounts.find((row) => matches(row, query.where)) ?? null;
                };
                Object.assign(tx.financeTransaction, {
                    async findFirst(query) {
                        log("financeTransaction.findFirst", query);
                        assert.equal(query.where.userId, userId);
                        return staged.transactions.find((row) => matches(row, query.where)) ?? null;
                    },
                    async create(query) {
                        log("financeTransaction.create", query);
                        assert.equal(query.data.userId, userId);
                        assert.equal("id" in query.data, false);
                        assert.equal("recordedAt" in query.data, false);
                        const row = {
                            ...query.data, id: `generated-${++serial}`,
                            amount: new Decimal(query.data.amount),
                            recordedAt: settings.recordedAt ?? new Date("2022-01-01T00:00:00.000Z"),
                        };
                        staged.transactions.push(row);
                        return row;
                    },
                    async updateMany(query) {
                        log("financeTransaction.updateMany", query);
                        assert.equal(query.where.userId, userId);
                        for (const field of ["id", "userId", "recordedAt"]) {
                            assert.equal(field in query.data, false);
                        }
                        let count = 0;
                        staged.transactions = staged.transactions.map((row) => {
                            if (!matches(row, query.where)) return row;
                            count++;
                            return { ...row, ...query.data, amount: new Decimal(query.data.amount) };
                        });
                        return { count };
                    },
                    async deleteMany(query) {
                        log("financeTransaction.deleteMany", query);
                        assert.equal(query.where.userId, userId);
                        const count = staged.transactions.filter((row) => matches(row, query.where)).length;
                        staged.transactions = staged.transactions.filter((row) => !matches(row, query.where));
                        return { count };
                    },
                });
                tx.financialPositionSnapshot = {
                    async create(query) {
                        log("financialPositionSnapshot.create", query);
                        const row = { ...query.data, id: `snapshot-${++serial}`, recordedAt: new Date() };
                        staged.positionHistory.push(row);
                        return row;
                    },
                };
                const result = await callback(tx);
                committed = staged;
                return result;
            },
        },
    };
}
