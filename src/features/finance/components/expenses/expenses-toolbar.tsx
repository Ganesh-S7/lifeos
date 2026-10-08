import {
    CalendarDays,
    Search,
    X,
} from "lucide-react";

import { Button, Input } from "@/components/ui";

export type ExpenseSort =
    | "date-desc"
    | "date-asc"
    | "amount-desc"
    | "amount-asc";

interface ExpensesToolbarProps {
    search: string;
    category: string;
    sort: ExpenseSort;
    categories: string[];
    onSearchChange: (value: string) => void;
    onCategoryChange: (value: string) => void;
    onSortChange: (value: ExpenseSort) => void;
    onReset: () => void;
}

export function ExpensesToolbar({
    search,
    category,
    sort,
    categories,
    onSearchChange,
    onCategoryChange,
    onSortChange,
    onReset,
}: ExpensesToolbarProps) {
    const hasActiveFilters = Boolean(search || category || sort !== "date-desc");

    return (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />

                <Input
                    value={search}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder="Search merchant, category or note..."
                    className="border-transparent bg-surface-subtle pl-9 focus:border-primary"
                />
            </div>

            <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm">
                    <CalendarDays className="size-3.5" />
                    October 2026
                </Button>

                <select
                    value={category}
                    onChange={(event) => onCategoryChange(event.target.value)}
                    className="h-8 rounded-md border border-border bg-surface px-3 text-xs font-medium text-text-primary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
                    aria-label="Filter by category"
                >
                    <option value="">All categories</option>

                    {categories?.map((item) => (
                        <option key={item} value={item}>
                            {item}
                        </option>
                    ))}
                </select>

                <div className="flex h-8 overflow-hidden rounded-md border border-border bg-surface">
                    <select
                        value={sort}
                        onChange={(event) =>
                            onSortChange(event.target.value as ExpenseSort)
                        }
                        className="h-full border-0 bg-transparent px-3 text-xs font-medium text-text-primary outline-none"
                        aria-label="Sort expenses"
                    >
                        <option value="date-desc">Newest first</option>
                        <option value="date-asc">Oldest first</option>
                        <option value="amount-desc">Highest amount</option>
                        <option value="amount-asc">Lowest amount</option>
                    </select>
                </div>

                {hasActiveFilters && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onReset}
                    >
                        <X className="size-3.5" />
                        Clear
                    </Button>
                )}
            </div>
        </div>
    );
}