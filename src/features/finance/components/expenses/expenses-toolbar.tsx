import {
    Search,
    X,
} from "lucide-react";

import { Button, DatePicker, Input, Select, SelectOption } from "@/components/ui";

export type ExpenseSort =
    | "date-desc"
    | "date-asc"
    | "amount-desc"
    | "amount-asc";

const sortOptions = [
    { label: "Newest first", value: "date-desc" },
    { label: "Oldest first", value: "date-asc" },
    { label: "Highest amount", value: "amount-desc" },
    { label: "Lowest amount", value: "amount-asc" },
] satisfies SelectOption<ExpenseSort>[];

interface ExpensesToolbarProps {
    search: string;
    category: string;
    sort: ExpenseSort;
    date: Date | null;
    categories: string[];
    onSearchChange: (value: string) => void;
    onCategoryChange: (value: string) => void;
    onSortChange: (value: ExpenseSort) => void;
    onDateChange: (value: Date | null) => void;
    onReset: () => void;
}

export function ExpensesToolbar({
    search,
    category,
    sort,
    categories,
    date,
    onSearchChange,
    onCategoryChange,
    onSortChange,
    onDateChange,
    onReset,
}: ExpensesToolbarProps) {

    const hasActiveFilters = Boolean(
        search.trim() ||
        (category !== "" && category !== "all") ||
        date ||
        sort !== "date-desc",
    );

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

            <div className="flex flex-wrap items-center gap-2">
                <DatePicker
                    value={date}
                    onChange={onDateChange}
                    placeholder="Date"
                    className="w-37.5"
                    triggerClassName="h-8 text-xs"
                />

                <Select
                    value={category || null}
                    options={[
                        { label: "All categories", value: "all" },
                        ...categories.map((item) => ({
                            label: item,
                            value: item,
                        })),
                    ]}
                    onChange={(value) => onCategoryChange(value ?? "")}
                    placeholder="Category"
                    className="w-37.5"
                    triggerClassName="h-8 min-w-[140px]"
                />

                <Select<ExpenseSort>
                    value={sort}
                    options={sortOptions}
                    onChange={(value) => {
                        if (value !== null) {
                            onSortChange(value);
                        }
                    }}
                    className="w-37.5"
                    contentClassName="!w-40"
                    triggerClassName="h-8 min-w-[150px] text-xs"
                />

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