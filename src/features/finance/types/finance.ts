export interface BankAccount {
    id: string;
    name: string;
    balanceSnapshot: number;
    balanceSnapshotAt: string;
    createdAt: string;
    updatedAt: string;
}

export interface Investment {
    id: string;
    name: string;
    type: string;
    valuationSnapshot: number;
    valuationSnapshotAt: string;
    createdAt: string;
    updatedAt: string;
}

export interface Liability {
    id: string;
    name: string;
    type: string;
    balance: number;
    monthlyPayment?: number;
    createdAt: string;
    updatedAt: string;
}

export type TransactionType =
    | "income"
    | "expense"
    | "transfer"
    | "investment_purchase"
    | "investment_sale";

export interface FinanceTransaction {
    id: string;
    type: TransactionType;
    amount: number;
    description: string;
    date: string;
    recordedAt: string;
    category?: string;
    accountId?: string;
    destinationAccountId?: string;
    investmentId?: string;
    note?: string;
}

export interface FinanceData {
    accounts: BankAccount[];
    investments: Investment[];
    liabilities: Liability[];
    transactions: FinanceTransaction[];
    /** Persisted positions returned by the authenticated Finance API. */
    positionHistory?: FinancialPositionSnapshot[];
}

export interface FinancialPositionSnapshot {
    recordedAt: string;
    bank: number;
    investments: number;
    debt: number;
}
