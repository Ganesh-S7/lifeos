import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { Decimal } from "@prisma/client/runtime/client";

const schemas = await import("../src/features/finance/schemas/finance-request-schema.ts");
const serializers = await import("../src/features/finance/server/finance-dto.ts");
const {
    bankAccountRequestSchema,
    investmentRequestSchema,
    liabilityRequestSchema,
    financeDateOnlySchema,
    financeMoneySchema,
    financeRecordParamsSchema,
    financeTransactionRequestSchema,
    financeHistoryQuerySchema,
} = schemas;
const {
    financeDateToDatabase,
    financeDateFromDatabase,
    toBankAccountDto,
    toInvestmentDto,
    toLiabilityDto,
    toFinanceTransactionDto,
    toFinancialPositionSnapshotDto,
    toFinanceDataResponse,
} = serializers;

const timestamp = new Date("2026-10-01T10:00:00.123Z");
const databaseFields = {
    id: "record-id",
    userId: "owner-id",
    name: "Everyday",
    createdAt: timestamp,
    updatedAt: timestamp,
};
const transaction = {
    type: "income",
    accountId: "account-id",
    amount: 100.25,
    description: "Salary",
    date: "2026-10-20",
};
const databaseTransaction = {
    ...transaction,
    id: "transaction-id",
    userId: "owner-id",
    amount: new Decimal("100.25"),
    date: new Date("2026-10-20T00:00:00.000Z"),
    recordedAt: timestamp,
    category: null,
    destinationAccountId: null,
    investmentId: null,
    note: null,
};

test("entity requests use editable balance/value names and numeric amounts", () => {
    assert.deepEqual(bankAccountRequestSchema.parse({ name: " Everyday ", balance: 0 }), {
        name: "Everyday", balance: 0,
    });
    assert.equal(investmentRequestSchema.parse({
        name: "Holding", type: "Cryptocurrency", value: 500.25,
    }).value, 500.25);
    assert.equal(liabilityRequestSchema.parse({
        name: "Bike", type: "Loan", balance: 2000, monthlyPayment: null,
    }).monthlyPayment, undefined);
    assert.equal(liabilityRequestSchema.parse({
        name: "Bike", type: "Loan", balance: 0, monthlyPayment: 0,
    }).monthlyPayment, 0);
    for (const balance of [-1, "100", null, Infinity, NaN]) {
        assert.equal(bankAccountRequestSchema.safeParse({ name: "Bank", balance }).success, false);
    }
});

test("request bodies reject ownership, IDs, calculated snapshots and timestamps", () => {
    for (const [schema, input] of [
        [bankAccountRequestSchema, { name: "Bank", balance: 100 }],
        [investmentRequestSchema, { name: "Holding", type: "Crypto", value: 100 }],
        [liabilityRequestSchema, { name: "Loan", type: "Bike", balance: 100 }],
        [financeTransactionRequestSchema, transaction],
    ]) {
        for (const key of [
            "userId", "id", "createdAt", "updatedAt", "recordedAt",
            "balanceSnapshot", "balanceSnapshotAt", "valuationSnapshot", "valuationSnapshotAt",
            "demoAccount", "unexpected",
        ]) {
            assert.equal(schema.safeParse({ ...input, [key]: "untrusted" }).success, false, key);
        }
    }
    assert.equal(financeRecordParamsSchema.safeParse({ id: "cuid-or-uuid" }).success, true);
    assert.equal(financeRecordParamsSchema.safeParse({ id: " ", userId: "owner" }).success, false);
});

test("transaction variants enforce account and type-specific relationships", () => {
    const variants = [
        transaction,
        { ...transaction, type: "expense", category: "Bills" },
        { ...transaction, type: "transfer", destinationAccountId: "savings-id" },
        { ...transaction, type: "investment_purchase", investmentId: "holding-id" },
        { ...transaction, type: "investment_sale", investmentId: "holding-id" },
    ];
    for (const input of variants) {
        assert.equal(financeTransactionRequestSchema.safeParse(input).success, true);
        const { accountId: omitted, ...withoutAccount } = input;
        assert.ok(omitted);
        assert.equal(financeTransactionRequestSchema.safeParse(withoutAccount).success, false);
        for (const accountId of [null, "", " "]) {
            assert.equal(financeTransactionRequestSchema.safeParse({ ...input, accountId }).success, false);
        }
        for (const amount of [0, -10, Infinity, "10"]) {
            assert.equal(financeTransactionRequestSchema.safeParse({ ...input, amount }).success, false);
        }
    }
    for (const input of [
        { ...transaction, type: "expense" },
        { ...transaction, type: "expense", category: " " },
        { ...transaction, type: "transfer" },
        { ...transaction, type: "transfer", destinationAccountId: transaction.accountId },
        { ...transaction, type: "investment_purchase" },
        { ...transaction, type: "investment_sale" },
        { ...transaction, type: "unknown" },
        { ...transaction, investmentId: "unrelated" },
        { ...transaction, destinationAccountId: "unrelated" },
    ]) {
        assert.equal(financeTransactionRequestSchema.safeParse(input).success, false);
    }
});

test("numeric transport never silently rounds or coerces money", () => {
    for (const amount of [0, 0.1, 0.29, 123.45, -123.45]) {
        assert.equal(financeMoneySchema.parse(amount), amount);
    }
    for (const amount of [0.001, 1.005, 0.1 + 0.2, 1e16, Infinity, NaN, "1.25"]) {
        assert.equal(financeMoneySchema.safeParse(amount).success, false);
    }
});

test("date-only contracts reject invalid calendars and round-trip using UTC", () => {
    for (const date of ["2024-02-29", "2026-01-01", "1000-01-01", "9999-12-31"]) {
        assert.equal(financeDateFromDatabase(financeDateToDatabase(date)), date);
    }
    for (const date of [
        "2026-02-29", "2026-04-31", "2026-13-01", "2026-00-01", "2026-10-00",
        "2026-1-1", "2026-10-20T00:00:00Z", "0999-12-31", "",
    ]) {
        assert.equal(financeDateOnlySchema.safeParse(date).success, false, date);
    }
    assert.equal(financeDateOnlySchema.safeParse("2099-01-01").success, true);
    assert.equal(financeDateToDatabase("2026-10-20").toISOString(), "2026-10-20T00:00:00.000Z");
});

test("Prisma date-only conversion is independent of the server time zone", () => {
    const loader = new URL("./helpers/register-typescript.mjs", import.meta.url).href;
    const dtoModuleUrl = new URL("../src/features/finance/server/finance-dto.ts", import.meta.url).href;
    const source = `
        import ${JSON.stringify(loader)};
        const { financeDateToDatabase, financeDateFromDatabase } = await import(${JSON.stringify(dtoModuleUrl)});
        const value = financeDateToDatabase("2026-01-01");
        process.stdout.write(JSON.stringify([value.toISOString(), financeDateFromDatabase(value)]));
    `;
    for (const zone of ["Asia/Kolkata", "America/Los_Angeles"]) {
        const result = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
            env: { ...process.env, TZ: zone },
            encoding: "utf8",
        });
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(JSON.parse(result.stdout), ["2026-01-01T00:00:00.000Z", "2026-01-01"]);
    }
});

test("history requests only filter server-derived history, not supply positions", () => {
    assert.deepEqual(financeHistoryQuerySchema.parse({}), {});
    assert.equal(financeHistoryQuerySchema.safeParse({
        from: "2026-10-01T05:30:00+05:30", to: "2026-10-01T00:00:00Z",
    }).success, true);
    for (const query of [
        { from: "2026-10-02T00:00:00Z", to: "2026-10-01T00:00:00Z" },
        { from: "2026-10-01" },
        { bank: 100, investments: 200, debt: 0 },
        { userId: "someone-else" },
        { recordedAt: "2026-10-01T00:00:00Z" },
    ]) {
        assert.equal(financeHistoryQuerySchema.safeParse(query).success, false);
    }
});

test("Prisma entity DTOs explicitly serialize decimals, nulls and timestamps", () => {
    const bank = toBankAccountDto({
        ...databaseFields, balanceSnapshot: new Decimal("123.45"), balanceSnapshotAt: timestamp,
    });
    assert.equal(bank.balanceSnapshot, 123.45);
    assert.equal(bank.balanceSnapshotAt, timestamp.toISOString());
    assert.equal(bank.createdAt, timestamp.toISOString());
    assert.equal(bank.updatedAt, timestamp.toISOString());
    assert.equal("userId" in bank, false);
    const investment = toInvestmentDto({
        ...databaseFields, type: "Cryptocurrency",
        valuationSnapshot: new Decimal("500.25"), valuationSnapshotAt: timestamp,
    });
    assert.equal(investment.valuationSnapshot, 500.25);
    assert.equal(investment.valuationSnapshotAt, timestamp.toISOString());
    const liability = toLiabilityDto({
        ...databaseFields, type: "Loan", balance: new Decimal("2000"), monthlyPayment: null,
    });
    assert.equal(liability.balance, 2000);
    assert.equal(liability.monthlyPayment, undefined);
    assert.equal(JSON.stringify(liability).includes("monthlyPayment"), false);
    assert.equal(toLiabilityDto({
        ...databaseFields, type: "Loan", balance: new Decimal("0"), monthlyPayment: new Decimal("0"),
    }).monthlyPayment, 0);
    assert.equal("userId" in investment, false);
    assert.equal("userId" in liability, false);
});

test("transaction DTOs preserve database recording time and require valid relationships", () => {
    const result = toFinanceTransactionDto(databaseTransaction);
    assert.equal(result.recordedAt, timestamp.toISOString());
    assert.equal(result.date, "2026-10-20");
    assert.equal(result.amount, 100.25);
    assert.equal(result.accountId, transaction.accountId);
    assert.equal("userId" in result, false);
    assert.equal("demoAccount" in result, false);
    assert.equal("destinationAccountId" in result, false);
    assert.equal("investmentId" in result, false);
    assert.equal("note" in result, false);
    assert.throws(() => toFinanceTransactionDto({ ...databaseTransaction, type: "expense" }));
    assert.throws(() => toFinanceTransactionDto({ ...databaseTransaction, accountId: null }));
    assert.throws(() => toFinanceTransactionDto({ ...databaseTransaction, investmentId: "unrelated" }));
    for (const fields of [
        { type: "expense", category: "Bills" },
        { type: "transfer", destinationAccountId: "savings-id" },
        { type: "investment_purchase", investmentId: "holding-id" },
        { type: "investment_sale", investmentId: "holding-id" },
    ]) {
        assert.equal(toFinanceTransactionDto({ ...databaseTransaction, ...fields }).type, fields.type);
    }
});

test("position DTOs carry stable database IDs without persisting calculated net worth", () => {
    const result = toFinancialPositionSnapshotDto({
        id: "position-id", userId: "owner-id", recordedAt: timestamp,
        bank: new Decimal("1000"), investments: new Decimal("250"), debt: new Decimal("500"),
    });
    assert.deepEqual(result, {
        id: "position-id", recordedAt: timestamp.toISOString(), bank: 1000, investments: 250, debt: 500,
    });
});

test("empty database collections stay empty; unsafe Decimal conversion fails closed", () => {
    const empty = { accounts: [], investments: [], liabilities: [], transactions: [], positionHistory: [] };
    assert.deepEqual(toFinanceDataResponse(empty), empty);
    for (const amount of ["0.001", "9007199254740999.99", "Infinity", "NaN"]) {
        assert.throws(() => toBankAccountDto({
            ...databaseFields, balanceSnapshot: new Decimal(amount), balanceSnapshotAt: timestamp,
        }));
    }
});
