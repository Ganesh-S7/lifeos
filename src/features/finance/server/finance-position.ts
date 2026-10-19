import { Decimal } from "@prisma/client/runtime/client";
import type {
    BankAccount,
    FinanceTransaction,
    Investment,
    Liability,
    Prisma,
} from "@/generated/prisma/client";
import { toFinancialPositionSnapshotDto } from "./finance-dto";

interface PositionRecords {
    accounts: BankAccount[];
    investments: Investment[];
    liabilities: Liability[];
    transactions: FinanceTransaction[];
}

// Exact integer cents avoid both JS floating point and Decimal precision-context rounding.
// Reject unsupported precision; this is not a new financial rounding policy.
function minorUnits(value: Prisma.Decimal): bigint {
    if (!value.isFinite() || value.decimalPlaces() > 2) {
        throw new RangeError("Finance values must have at most two decimal places.");
    }
    return BigInt(value.toFixed(2).replace(".", ""));
}

function decimalFromMinorUnits(value: bigint): Prisma.Decimal {
    const absolute = value < BigInt(0) ? -value : value;
    const whole = absolute / BigInt(100);
    const fraction = (absolute % BigInt(100)).toString().padStart(2, "0");
    return new Decimal(`${value < BigInt(0) ? "-" : ""}${whole}.${fraction}`);
}

/** Same snapshot cutoffs/effects as the frontend ledger, with exact money arithmetic. */
export function calculateFinancialPosition(records: PositionRecords) {
    const accounts = new Map(records.accounts.map((account) => [account.id, {
        value: minorUnits(account.balanceSnapshot),
        snapshotAt: account.balanceSnapshotAt.getTime(),
    }]));
    const investments = new Map(records.investments.map((investment) => [investment.id, {
        value: minorUnits(investment.valuationSnapshot),
        snapshotAt: investment.valuationSnapshotAt.getTime(),
    }]));

    for (const transaction of records.transactions) {
        const amount = minorUnits(transaction.amount);
        const recordedAt = transaction.recordedAt.getTime();
        const source = accounts.get(transaction.accountId);
        if (source && recordedAt > source.snapshotAt) {
            source.value += transaction.type === "income" || transaction.type === "investment_sale"
                ? amount : -amount;
        }
        if (transaction.type === "transfer" && transaction.destinationAccountId) {
            const destination = accounts.get(transaction.destinationAccountId);
            if (destination && recordedAt > destination.snapshotAt) destination.value += amount;
        }
        const investment = transaction.investmentId
            ? investments.get(transaction.investmentId) : undefined;
        if (investment && recordedAt > investment.snapshotAt) {
            if (transaction.type === "investment_purchase") investment.value += amount;
            if (transaction.type === "investment_sale") investment.value -= amount;
        }
    }

    return {
        bank: decimalFromMinorUnits(
            [...accounts.values()].reduce((sum, item) => sum + item.value, BigInt(0)),
        ),
        investments: decimalFromMinorUnits(
            [...investments.values()].reduce((sum, item) => sum + item.value, BigInt(0)),
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
