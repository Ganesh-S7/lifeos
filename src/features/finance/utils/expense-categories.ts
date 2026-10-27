/** Stable labels remain strings throughout existing transactions and reports. */
export const builtInExpenseCategories = [
    "Food",
    "Shopping",
    "Transport",
    "Bills",
    "Health",
    "Entertainment",
    "Other",
] as const;

export function cleanCategoryName(name: string) {
    return name.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function categoryNameKey(name: string) {
    return cleanCategoryName(name).toLowerCase();
}

export function canonicalCategoryName(name: string) {
    return builtInExpenseCategories.find((item) => categoryNameKey(item) === categoryNameKey(name))
        ?? cleanCategoryName(name);
}

/** Include legacy labels verbatim in filters so old assignments remain selectable. */
export function expenseCategoryLabels(names: string[]) {
    return [...new Set<string>([...builtInExpenseCategories, ...names])];
}
