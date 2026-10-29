/** Form-only sentinel; persisted as isUntracked=true with no account reference. */
export const UNTRACKED_EXPENSE_ACCOUNT = "__untracked__";

export function expenseAccountName(account: string, accounts: { id: string; name: string }[]) {
    return account === UNTRACKED_EXPENSE_ACCOUNT
        ? "Untracked"
        : accounts.find((item) => item.id === account)?.name || "Account unavailable";
}

export interface ExpenseAccountOption {
    label: string;
    value: string;
}

/** Options retain the server's creation-date/ID order; there is no primary preference. */
export function defaultExpenseAccount(accounts: ExpenseAccountOption[]) {
    return accounts[0]?.value ?? "";
}

/** An async refresh may only fill a genuinely untouched, empty field. */
export function pendingExpenseAccount(current: string, dirty: boolean, accounts: ExpenseAccountOption[]) {
    return !current && !dirty ? defaultExpenseAccount(accounts) : current;
}
