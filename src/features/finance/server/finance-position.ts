import type { Liability, Prisma } from "@/generated/prisma/client";
import { toFinancialPositionSnapshotDto } from "./finance-dto";
import {
    applyLedgerTransaction,
    createLedgerBalances,
    decimalFromMinorUnits,
    minorUnits,
    type LedgerRecords,
} from "./finance-ledger";

interface PositionRecords extends LedgerRecords {
    liabilities: Liability[];
}

/** Same snapshot cutoffs/effects as the frontend ledger, with exact money arithmetic. */
export function calculateFinancialPosition(records: PositionRecords) {
    const balances = createLedgerBalances(records);
    for (const transaction of records.transactions) {
        applyLedgerTransaction(balances, transaction);
    }

    return {
        bank: decimalFromMinorUnits(
            [...balances.accounts.values()].reduce((sum, item) => sum + item.value, BigInt(0)),
        ),
        investments: decimalFromMinorUnits(
            [...balances.investments.values()].reduce((sum, item) => sum + item.value, BigInt(0)),
        ),
        debt: decimalFromMinorUnits(
            records.liabilities.reduce((sum, item) => sum + minorUnits(item.balance), BigInt(0)),
        ),
    };
}

/** Call only inside the mutation's transaction, after applying its changes. */
export async function writeFinancialPosition(
    transaction: Prisma.TransactionClient,
    userId: string,
) {
    if (!userId.trim()) throw new Error("An authenticated user is required.");

    const accounts = await transaction.bankAccount.findMany({ where: { userId } });
    const investments = await transaction.investment.findMany({ where: { userId } });
    const liabilities = await transaction.liability.findMany({ where: { userId } });
    const transactions = await transaction.financeTransaction.findMany({ where: { userId } });
    const position = calculateFinancialPosition({ accounts, investments, liabilities, transactions });
    const snapshot = await transaction.financialPositionSnapshot.create({
        data: { userId, ...position },
    });

    // Check the existing numeric DTO range before committing, not after the write succeeds.
    return toFinancialPositionSnapshotDto(snapshot);
}
