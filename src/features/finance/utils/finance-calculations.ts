import type {
    BankAccount,
    FinanceData,
    FinanceTransaction,
    Investment,
} from "../types/finance";

export function accountBalance(account: BankAccount, transactions: FinanceTransaction[]) {
    return transactions.reduce((balance, transaction) => {
        if (transaction.recordedAt <= account.balanceSnapshotAt) return balance;
        const amount = transaction.amount;
        if (transaction.type === "transfer") {
            return balance + (transaction.destinationAccountId === account.id ? amount : 0)
                - (transaction.accountId === account.id ? amount : 0);
        }
        if (transaction.accountId !== account.id) return balance;
        return balance + (transaction.type === "income" || transaction.type === "investment_sale"
            ? amount : -amount);
    }, account.balanceSnapshot);
}

export function investmentValue(investment: Investment, transactions: FinanceTransaction[]) {
    return transactions.reduce((value, transaction) => {
        if (transaction.recordedAt <= investment.valuationSnapshotAt ||
            transaction.investmentId !== investment.id) return value;
        if (transaction.type === "investment_purchase") return value + transaction.amount;
        if (transaction.type === "investment_sale") return value - transaction.amount;
        return value;
    }, investment.valuationSnapshot);
}

export function financialSnapshot(data: FinanceData) {
    const bank = data.accounts.reduce((sum, account) => sum + accountBalance(account, data.transactions), 0);
    const investments = data.investments.reduce((sum, investment) =>
        sum + investmentValue(investment, data.transactions), 0);
    const debt = data.liabilities.reduce((sum, liability) => sum + liability.balance, 0);
    return { bank, investments, debt, netWorth: bank + investments - debt };
}

export function monthlyActivity(transactions: FinanceTransaction[], month: string) {
    const current = transactions.filter((transaction) => transaction.date.startsWith(month));
    const income = current.filter((transaction) => transaction.type === "income")
        .reduce((sum, transaction) => sum + transaction.amount, 0);
    const expenses = current.filter((transaction) => transaction.type === "expense")
        .reduce((sum, transaction) => sum + transaction.amount, 0);
    const netCashFlow = income - expenses;
    return { income, expenses, netCashFlow, savingsRate: income > 0 ? netCashFlow / income * 100 : null };
}

export function categorySpending(transactions: FinanceTransaction[], month: string) {
    const totals = new Map<string, number>();
    for (const transaction of transactions) {
        if (transaction.type !== "expense" || !transaction.date.startsWith(month)) continue;
        const category = transaction.category || "Other";
        totals.set(category, (totals.get(category) || 0) + transaction.amount);
    }
    return [...totals].map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount);
}
