"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import {
    DayPicker,
    getDefaultClassNames,
    type Matcher,
} from "@daypicker/react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils/cn";

export interface DatePickerProps {
    id?: string;
    label?: string;
    required?: boolean;
    placeholder?: string;

    value?: Date | null;
    defaultValue?: Date | null;

    onChange?: (value: Date | null) => void;

    error?: string;
    disabled?: boolean;

    disabledDates?: Matcher | Matcher[];

    className?: string;
    triggerClassName?: string;
    calendarClassName?: string;
}

function formatDate(date: Date) {
    return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(date);
}

const defaultClassNames = getDefaultClassNames();
export function DatePicker({
    id,
    label,
    required = false,
    placeholder = "Select date",
    value,
    defaultValue,
    onChange,
    error,
    disabled = false,
    disabledDates,
    className,
    triggerClassName,
    calendarClassName,
}: DatePickerProps) {
    const [open, setOpen] = useState(false);
    const [internalValue, setInternalValue] = useState<Date | undefined>(
        defaultValue ?? undefined,
    );

    const selectedDate =
        value === undefined ? internalValue : value ?? undefined;

    const errorId = error && id ? `${id}-error` : undefined;

    const handleSelect = (date: Date | undefined) => {
        if (value === undefined) {
            setInternalValue(date);
        }

        onChange?.(date ?? null);

        if (date) {
            setOpen(false);
        }
    };

    return (
        <div className={cn("flex w-full flex-col gap-1.5", className)}>
            {label && (
                <label
                    htmlFor={id}
                    className="text-xs font-medium text-text-primary"
                >
                    {label}

                    {required && (
                        <span
                            className="ml-0.5 text-danger"
                            aria-hidden="true"
                        >
                            *
                        </span>
                    )}
                </label>
            )}

            <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
                <PopoverPrimitive.Trigger asChild>
                    <button
                        id={id}
                        type="button"
                        disabled={disabled}
                        aria-describedby={errorId}
                        className={cn(
                            "flex h-10 w-full items-center justify-between gap-2",
                            "rounded-md border bg-surface px-3",
                            "text-sm outline-none transition-colors",
                            "disabled:cursor-not-allowed disabled:bg-surface-subtle",
                            "disabled:text-text-muted",
                            error
                                ? "border-danger focus:border-danger"
                                : "border-border focus:border-primary",
                            "focus:ring-2 focus:ring-primary/15",
                            !selectedDate && "text-text-muted",
                            selectedDate && "text-text-primary",
                            triggerClassName,
                        )}
                    >
                        <span>
                            {selectedDate
                                ? formatDate(selectedDate)
                                : placeholder}
                        </span>

                        <CalendarDays className="size-4 shrink-0 text-text-muted" />
                    </button>
                </PopoverPrimitive.Trigger>

                <PopoverPrimitive.Portal>
                    <PopoverPrimitive.Content
                        side="bottom"
                        align="start"
                        sideOffset={6}
                        collisionPadding={8}
                        className={cn(
                            "z-50 rounded-lg border border-border",
                            "bg-surface p-3 text-text-primary shadow-lg",
                            "outline-none",
                            calendarClassName,
                        )}
                    >
                        <DayPicker
                            mode="single"
                            selected={selectedDate}
                            onSelect={handleSelect}
                            disabled={disabledDates}
                            defaultMonth={selectedDate ?? new Date()}
                            required={required}
                            showOutsideDays
                            classNames={{
                                root: "text-text-primary",
                                months: "flex",
                                month: "space-y-4",
                                month_caption:
                                    "relative flex items-center justify-center px-8",
                                caption_label:
                                    "text-sm font-semibold text-text-primary",

                                nav: "absolute inset-x-0 top-0 flex items-center justify-between",

                                button_previous:
                                    "inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary",

                                button_next:
                                    "inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary",

                                chevron: defaultClassNames.chevron,

                                month_grid: "w-full border-collapse",
                                weekdays: "flex",
                                weekday:
                                    "w-9 text-center text-[10px] font-medium uppercase text-text-muted",
                                week: "mt-1 flex w-full",
                                day: "flex size-9 items-center justify-center",
                                day_button:
                                    "inline-flex size-8 items-center justify-center rounded-md text-xs font-medium transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                                selected:
                                    "bg-primary text-primary-foreground hover:bg-primary-hover",
                                today: "font-semibold text-primary",
                                outside: "text-text-muted opacity-50",
                                disabled:
                                    "pointer-events-none text-text-muted opacity-30",
                                hidden: "invisible",
                            }}
                            styles={{
                                chevron: {
                                    fill: "var(--text-secondary)",
                                },
                            }}
                        />
                    </PopoverPrimitive.Content>
                </PopoverPrimitive.Portal>
            </PopoverPrimitive.Root>

            {error && (
                <p
                    id={errorId}
                    className="text-xs text-danger"
                >
                    {error}
                </p>
            )}
        </div>
    );
}

DatePicker.displayName = "DatePicker";