"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type SelectValue = string | number;

export interface SelectOption<T extends SelectValue> {
    label: string;
    value: T;
    disabled?: boolean;
}

export interface SelectProps<T extends SelectValue> {
    id?: string;
    label?: string;
    required?: boolean;
    placeholder?: string;

    options: SelectOption<T>[];

    value?: T | null;
    defaultValue?: T | null;

    onChange?: (value: T | null) => void;

    name?: string;
    error?: string;

    disabled?: boolean;

    className?: string;
    triggerClassName?: string;
    contentClassName?: string;
}

function serializeValue(value: SelectValue) {
    return typeof value === "number"
        ? `number:${value}`
        : `string:${value}`;
}

function deserializeOption<T extends SelectValue>(
    serializedValue: string,
    options: SelectOption<T>[],
) {
    return options.find(
        (option) => serializeValue(option.value) === serializedValue,
    );
}

const Select = <T extends SelectValue>({
    id,
    label,
    required = false,
    placeholder = "Select",
    options,
    value,
    defaultValue,
    onChange,
    name,
    error,
    disabled = false,
    className,
    triggerClassName,
    contentClassName,
}: SelectProps<T>) => {
    const errorId = error && id ? `${id}-error` : undefined;

    const describedBy = errorId;

    const selectedValue =
        value == null ? undefined : serializeValue(value);

    const selectedDefaultValue =
        defaultValue == null
            ? undefined
            : serializeValue(defaultValue);

    const handleValueChange = (nextValue: string) => {
        const selectedOption = deserializeOption(nextValue, options);

        onChange?.(selectedOption?.value ?? null);
    };

    return (
        <div
            className={cn(
                "flex flex-col gap-1.5",
                label || error ? "w-full" : "w-auto",
                className,
            )}
        >
            {label && (
                <label
                    htmlFor={id}
                    className="text-xs font-medium text-text-primary"
                >
                    {label}

                    {required && (
                        <span className="ml-0.5 text-danger" aria-hidden="true">
                            *
                        </span>
                    )}
                </label>
            )}

            <SelectPrimitive.Root
                value={selectedValue}
                defaultValue={selectedDefaultValue}
                onValueChange={handleValueChange}
                name={name}
                required={required}
                disabled={disabled}
            >
                <SelectPrimitive.Trigger
                    id={id}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy}
                    className={cn(
                        "flex h-10 w-full items-center justify-between gap-2",
                        "rounded-md border bg-surface px-3",
                        "text-sm text-text-primary",
                        "outline-none transition-colors",
                        "data-placeholder:text-text-muted",
                        "focus:ring-2 focus:ring-primary/15",
                        error
                            ? "border-danger focus:border-danger"
                            : "border-border focus:border-primary",
                        "disabled:cursor-not-allowed",
                        "disabled:bg-surface-subtle",
                        "disabled:text-text-muted",
                        triggerClassName,
                    )}
                >
                    <SelectPrimitive.Value placeholder={placeholder} />

                    <SelectPrimitive.Icon
                        className="shrink-0 text-text-muted"
                        aria-hidden="true"
                    >
                        <ChevronDown className="size-4" />
                    </SelectPrimitive.Icon>
                </SelectPrimitive.Trigger>

                <SelectPrimitive.Portal>
                    <SelectPrimitive.Content
                        position="popper"
                        sideOffset={4}
                        className={cn(
                            "z-50 max-h-72 w-(--radix-select-trigger-width)",
                            "overflow-hidden rounded-md",
                            "border border-border bg-surface",
                            "text-text-primary shadow-lg",
                            "animate-in fade-in-0 zoom-in-95",
                            contentClassName,
                        )}
                    >
                        <SelectPrimitive.Viewport className="p-1">
                            {options.map((option) => {
                                const serializedValue = serializeValue(option.value);

                                return (
                                    <SelectPrimitive.Item
                                        key={serializedValue}
                                        value={serializedValue}
                                        disabled={option.disabled}
                                        className={cn(
                                            "relative flex h-9 w-full cursor-pointer",
                                            "select-none items-center rounded-md",
                                            "px-3 pr-9 text-sm outline-none",
                                            "text-text-primary",
                                            "data-highlighted:bg-surface-elevated",
                                            "data-[state=checked]:bg-primary-subtle",
                                            "data-disabled:pointer-events-none",
                                            "data-disabled:opacity-50",
                                        )}
                                    >
                                        <SelectPrimitive.ItemText>
                                            {option.label}
                                        </SelectPrimitive.ItemText>

                                        <SelectPrimitive.ItemIndicator className="absolute right-3">
                                            <Check className="size-4 text-primary" />
                                        </SelectPrimitive.ItemIndicator>
                                    </SelectPrimitive.Item>
                                );
                            })}
                        </SelectPrimitive.Viewport>
                    </SelectPrimitive.Content>
                </SelectPrimitive.Portal>
            </SelectPrimitive.Root>

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
};

Select.displayName = "Select";

export default Select;