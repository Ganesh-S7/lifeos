import type {
    BankAccount,
    FinanceData,
    FinanceTransaction,
    FinancialPositionSnapshot,
    Investment,
    Liability,
} from "./finance";
import type { FinanceTransactionRequest } from "../schemas/finance-request-schema";

// Reuse the frontend's numeric money, ISO timestamps, and optional-field conventions.
export type BankAccountDto = BankAccount;
export type InvestmentDto = Investment;
export type LiabilityDto = Liability;

/** Every database transaction has an account; demo records are not API records. */
export type FinanceTransactionDto = Omit<
    FinanceTransaction,
    "demoAccount" | "accountId" | "destinationAccountId" | "investmentId" | "category" | "type"
> & FinanceTransactionRequest;

export interface FinancialPositionSnapshotDto extends FinancialPositionSnapshot {
    id: string;
}

/** An empty user's response contains five empty arrays, with no seeded baseline. */
export interface FinanceDataResponse extends FinanceData {
    accounts: BankAccountDto[];
    investments: InvestmentDto[];
    liabilities: LiabilityDto[];
    transactions: FinanceTransactionDto[];
    positionHistory: FinancialPositionSnapshotDto[];
}
