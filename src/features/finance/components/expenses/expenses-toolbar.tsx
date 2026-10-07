import {
    CalendarDays,
    ListFilter,
    Search,
    SlidersHorizontal,
} from "lucide-react";

import { Button, Input } from "@/components/ui";

export function ExpensesToolbar() {
    return (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />

                <Input
                    placeholder="Search expenses..."
                    className="border-transparent bg-surface-subtle pl-9 focus:border-primary"
                />
            </div>

            <div className="flex gap-2 overflow-x-auto">
                <Button variant="outline" size="sm">
                    <CalendarDays className="size-3.5" />
                    October 2026
                </Button>

                <Button variant="outline" size="sm">
                    <ListFilter className="size-3.5" />
                    Category
                </Button>

                <Button variant="outline" size="sm">
                    <SlidersHorizontal className="size-3.5" />
                    Filters
                </Button>
            </div>
        </div>
    );
}