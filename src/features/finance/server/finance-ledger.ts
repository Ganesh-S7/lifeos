import { Decimal } from "@prisma/client/runtime/client";
import type {
    BankAccount,
    FinanceTransaction,
    Investment,
    Prisma,
} from "@/generated/prisma/client";

export interface LedgerRecords {
    accounts: BankAccount[];
    investments: Investment[];
    transactions: FinanceTransaction[];
}

interface LedgerBalance {
    value: bigint;
    snapshotAt: number;
    name: string;
    kind: "account" | "investment";
}

// Exact cents preserve the existing Decimal contract without choosing a rounding policy.
export function minorUnits(value: Prisma.Decimal): bigint {
    if (!value.isFinite() || value.decimalPlaces() > 2) {
        throw new RangeError("Finance values must have at most two decimal places.");
    }
    return BigInt(value.toFixed(2).replace(".", ""));
}

export function decimalFromMinorUnits(value: bigint): Prisma.Decimal {
    const absolute = value < BigInt(0) ? -value : value;
    const whole = absolute / BigInt(100);
    const fraction = (absolute % BigInt(100)).toString().padStart(2, "0");
    return new Decimal(`${value < BigInt(0) ? "-" : ""}${whole}.${fraction}`);
}

export function createLedgerBalances(records: Pick<LedgerRecords, "accounts" | "investments">) {
    return {
        accounts: new Map(records.accounts.map((account) => [account.id, {
            value: minorUnits(account.balanceSnapshot),
            snapshotAt: account.balanceSnapshotAt.getTime(),
            name: account.name,
            kind: "account" as const,
        }])),
        investments: new Map(records.investments.map((investment) => [investment.id, {
            value: minorUnits(investment.valuationSnapshot),
            snapshotAt: investment.valuationSnapshotAt.getTime(),
            name: investment.name,
            kind: "investment" as const,
        }])),
    };
}

/** Shared by position aggregation and running-balance validation. */
export function applyLedgerTransaction(
    balances: ReturnType<typeof createLedgerBalances>,
    transaction: FinanceTransaction,
) {
    const changes = new Map<LedgerBalance, bigint>();
    const amount = minorUnits(transaction.amount);
    const recordedAt = transaction.recordedAt.getTime();
    function change(entry: LedgerBalance | undefined, delta: bigint) {
        if (entry && recordedAt > entry.snapshotAt) {
            changes.set(entry, (changes.get(entry) ?? BigInt(0)) + delta);
        }
    }

    change(
        balances.accounts.get(transaction.accountId),
        transaction.type === "income" || transaction.type === "investment_sale" ? amount : -amount,
    );
    if (transaction.type === "transfer" && transaction.destinationAccountId) {
        change(balances.accounts.get(transaction.destinationAccountId), amount);
    }
    const investment = transaction.investmentId
        ? balances.investments.get(transaction.investmentId) : undefined;
    if (transaction.type === "investment_purchase") change(investment, amount);
    if (transaction.type === "investment_sale") change(investment, -amount);
    for (const [entry, delta] of changes) entry.value += delta;
    return changes;
}

export class LedgerConflictError extends Error {
    readonly code: "NEGATIVE_BALANCE" | "AMBIGUOUS_LEDGER_ORDER";

    constructor(
        code: "NEGATIVE_BALANCE" | "AMBIGUOUS_LEDGER_ORDER",
        message: string,
    ) {
        super(message);
        this.code = code;
    }
}

/** Validate every running balance, including effects of existing transfers/trades. */
export function validateFinanceLedger(records: LedgerRecords) {
    const balances = createLedgerBalances(records);
    const ordered = [...records.transactions].sort((a, b) =>
        a.recordedAt.getTime() - b.recordedAt.getTime());

    for (let index = 0; index < ordered.length;) {
        const timestamp = ordered[index].recordedAt.getTime();
        const group = new Map<LedgerBalance, { opening: bigint; debits: bigint }>();
        do {
            for (const [entry, delta] of applyLedgerTransaction(balances, ordered[index])) {
                const totals = group.get(entry) ?? { opening: entry.value - delta, debits: BigInt(0) };
                if (delta < BigInt(0)) totals.debits += delta;
                group.set(entry, totals);
            }
            index++;
        } while (index < ordered.length && ordered[index].recordedAt.getTime() === timestamp);

        for (const [entry, totals] of group) {
            // At cent precision, the store's < -0.001 tolerance is exactly < zero cents.
            if (entry.value < BigInt(0)) {
                throw new LedgerConflictError("NEGATIVE_BALANCE", entry.kind === "account"
                    ? `${entry.name} would have a negative balance.`
                    : `${entry.name} does not have enough tracked value for this sale.`);
            }
            // SQL has no insertion-order contract for tied recordedAt values. Do not
            // invent one where it changes the result of the store's prefix validation.
            if (totals.opening + totals.debits < BigInt(0)) {
                throw new LedgerConflictError("AMBIGUOUS_LEDGER_ORDER",
                    "Transactions share a recording timestamp and their order affects available funds.");
            }
        }
    }
}
