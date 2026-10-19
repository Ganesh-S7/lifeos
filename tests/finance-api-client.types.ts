import { financeApi } from "../src/features/finance/api/finance-api";
import type {
    BankAccountDto,
    FinanceDataResponse,
    FinanceTransactionDto,
    FinanceTransactionInput,
    InvestmentDto,
    LiabilityDto,
} from "../src/features/finance/types/finance-api";

/** Compile-only assertions checked by tsc; this function is never executed. */
export function financeApiClientTypeChecks() {
    const data: Promise<FinanceDataResponse> = financeApi.getFinanceData();
    const account: Promise<BankAccountDto> = financeApi.createAccount({ name: "Bank", balance: 0 });
    const investment: Promise<InvestmentDto> = financeApi.createInvestment({ name: "Holding", type: "Cryptocurrency", value: 0 });
    const liability: Promise<LiabilityDto> = financeApi.createLiability({ name: "Loan", type: "Loan", balance: 0, monthlyPayment: null });
    const base = { amount: 1, description: "Recorded", date: "2026-10-20", accountId: "bank" };
    const variants: FinanceTransactionInput[] = [
        { ...base, type: "income", category: null, note: null },
        { ...base, type: "expense", category: "Food" },
        { ...base, type: "transfer", destinationAccountId: "savings" },
        { ...base, type: "investment_purchase", investmentId: "holding" },
        { ...base, type: "investment_sale", investmentId: "holding" },
    ];
    const transactions: Promise<FinanceTransactionDto>[] = variants.map(financeApi.createTransaction);
    const deleted: Promise<void> = financeApi.deleteTransaction("record");

    // @ts-expect-error Ownership is never a request field.
    financeApi.createAccount({ name: "Bank", balance: 0, userId: "forged" });
    // @ts-expect-error Accounts use balance, not the raw snapshot column.
    financeApi.createAccount({ name: "Bank", balanceSnapshot: 0 });
    // @ts-expect-error Investments use value, not balance.
    financeApi.createInvestment({ name: "Holding", type: "Fund", balance: 0 });
    // @ts-expect-error Transfers require a destination.
    financeApi.createTransaction({ ...base, type: "transfer" });
    // @ts-expect-error Expenses require a category.
    financeApi.createTransaction({ ...base, type: "expense" });
    // @ts-expect-error Trades require an investment reference.
    financeApi.createTransaction({ ...base, type: "investment_sale" });
    // @ts-expect-error Trades do not accept a destination account.
    financeApi.createTransaction({ ...base, type: "investment_purchase", investmentId: "holding", destinationAccountId: "other" });
    // @ts-expect-error The server controls recording metadata.
    financeApi.updateTransaction("record", { ...base, type: "income", recordedAt: "forged" });

    return { data, account, investment, liability, transactions, deleted };
}
