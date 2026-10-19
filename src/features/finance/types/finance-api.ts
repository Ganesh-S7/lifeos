import type {
    BankAccount,
    FinanceData,
    FinanceTransaction,
    FinancialPositionSnapshot,
    Investment,
    Liability,
} from "./finance";
import type { z } from "zod";
import type {
    bankAccountRequestSchema,
    investmentRequestSchema,
    liabilityRequestSchema,
    financeTransactionRequestSchema,
    FinanceTransactionRequest,
} from "../schemas/finance-request-schema";

// JSON input types retain nullable optional fields before the server normalizes them.
// These type-only dependencies do not load schemas or server modules in the client.
export type BankAccountInput = z.input<typeof bankAccountRequestSchema>;
export type InvestmentInput = z.input<typeof investmentRequestSchema>;
export type LiabilityInput = z.input<typeof liabilityRequestSchema>;
export type FinanceTransactionInput = z.input<typeof financeTransactionRequestSchema>;

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
