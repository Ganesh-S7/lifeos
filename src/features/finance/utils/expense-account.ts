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
