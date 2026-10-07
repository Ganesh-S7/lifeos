export interface Expense {
    id: string;
    merchant: string;
    category: string;
    account: string;
    amount: number;
    date: string;
    note?: string;
}