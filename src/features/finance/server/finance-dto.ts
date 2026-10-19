import type {
    BankAccount as DatabaseBankAccount,
    FinanceTransaction as DatabaseTransaction,
    FinancialPositionSnapshot as DatabasePosition,
    Investment as DatabaseInvestment,
    Liability as DatabaseLiability,
    Prisma,
} from "@/generated/prisma/client";
import {
    financeDateOnlySchema,
    financeMoneySchema,
    financeTransactionRequestSchema,
} from "../schemas/finance-request-schema";
import type {
    BankAccountDto,
    FinanceDataResponse,
    FinanceTransactionDto,
    FinancialPositionSnapshotDto,
    InvestmentDto,
    LiabilityDto,
} from "../types/finance-api";

/** Pure conversion only. Callers must first scope rows and references to the session user. */
function moneyToNumber(value: Prisma.Decimal): number {
    const amount = financeMoneySchema.parse(value.toNumber());
    if (!value.equals(amount.toString())) {
        throw new RangeError("Finance value cannot be represented safely as a numeric DTO.");
    }
    return amount;
}

export function financeDateToDatabase(value: string): Date {
    const date = financeDateOnlySchema.parse(value);
    return new Date(`${date}T00:00:00.000Z`);
}

export function financeDateFromDatabase(value: Date): string {
    // A Prisma @db.Date is a calendar date. Never format it in the host's local zone.
    return financeDateOnlySchema.parse(value.toISOString().slice(0, 10));
}

export function toBankAccountDto(row: DatabaseBankAccount): BankAccountDto {
    return {
        id: row.id,
        name: row.name,
        balanceSnapshot: moneyToNumber(row.balanceSnapshot),
        balanceSnapshotAt: row.balanceSnapshotAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

export function toInvestmentDto(row: DatabaseInvestment): InvestmentDto {
    return {
        id: row.id,
        name: row.name,
        type: row.type,
        valuationSnapshot: moneyToNumber(row.valuationSnapshot),
        valuationSnapshotAt: row.valuationSnapshotAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

export function toLiabilityDto(row: DatabaseLiability): LiabilityDto {
    return {
        id: row.id,
        name: row.name,
        type: row.type,
        balance: moneyToNumber(row.balance),
        monthlyPayment: row.monthlyPayment === null
            ? undefined
            : moneyToNumber(row.monthlyPayment),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

export function toFinanceTransactionDto(row: DatabaseTransaction): FinanceTransactionDto {
    // Reject inconsistent persisted relationships rather than hiding them in the DTO.
    const fields = financeTransactionRequestSchema.parse({
        type: row.type,
        amount: moneyToNumber(row.amount),
        description: row.description,
        date: financeDateFromDatabase(row.date),
        accountId: row.accountId,
        ...(row.category !== null ? { category: row.category } : {}),
        ...(row.destinationAccountId !== null
            ? { destinationAccountId: row.destinationAccountId }
            : {}),
        ...(row.investmentId !== null ? { investmentId: row.investmentId } : {}),
        ...(row.note !== null ? { note: row.note } : {}),
    });
    return {
        ...fields,
        id: row.id,
        recordedAt: row.recordedAt.toISOString(),
    };
}

export function toFinancialPositionSnapshotDto(
    row: DatabasePosition,
): FinancialPositionSnapshotDto {
    return {
        id: row.id,
        recordedAt: row.recordedAt.toISOString(),
        bank: moneyToNumber(row.bank),
        investments: moneyToNumber(row.investments),
        debt: moneyToNumber(row.debt),
    };
}

interface FinanceDatabaseRecords {
    accounts: DatabaseBankAccount[];
    investments: DatabaseInvestment[];
    liabilities: DatabaseLiability[];
    transactions: DatabaseTransaction[];
    positionHistory: DatabasePosition[];
}

export function toFinanceDataResponse(rows: FinanceDatabaseRecords): FinanceDataResponse {
    return {
        accounts: rows.accounts.map(toBankAccountDto),
        investments: rows.investments.map(toInvestmentDto),
        liabilities: rows.liabilities.map(toLiabilityDto),
        transactions: rows.transactions.map(toFinanceTransactionDto),
        positionHistory: rows.positionHistory.map(toFinancialPositionSnapshotDto),
    };
}
