"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { financeActions, useFinance } from "../../store/finance-store";
import { expenseCategoryRequestSchema } from "../../schemas/expense-category-schema";
import { categoryNameKey, cleanCategoryName } from "../../utils/expense-categories";
import { cn } from "@/lib/utils/cn";
import { Input } from "@/components/ui";

interface ExpenseCategoryComboboxProps {
    value: string;
    onChange: (value: string) => void;
    onBusyChange: (busy: boolean) => void;
    error?: string;
}

/** Scroll only the list, never its dialog or document ancestors. */
function revealOption(list: HTMLDivElement | null, index: number) {
    const option = list?.children.item(index);
    if (!list || !option) return;
    const bounds = list.getBoundingClientRect();
    const item = option.getBoundingClientRect();
    const top = bounds.top + list.clientTop;
    const bottom = top + list.clientHeight;
    if (item.top < top) list.scrollTop += item.top - top;
    else if (item.bottom > bottom) list.scrollTop += item.bottom - bottom;
}

export function ExpenseCategoryCombobox({
    value,
    onChange,
    onBusyChange,
    error,
}: ExpenseCategoryComboboxProps) {
    const { userId, ready, categories, categoriesReady, categoriesLoading, categoriesError } = useFinance();
    const id = useId();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState("");
    const [creationFailed, setCreationFailed] = useState(false);
    const pending = useRef(false);
    const alive = useRef(true);
    const options = useRef<HTMLDivElement>(null);
    const anchor = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLInputElement>(null);
    const returnFocus = useRef(false);

    useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; };
    }, []);

    useEffect(() => {
        if (ready && !categoriesReady && !categoriesLoading && !categoriesError) {
            void financeActions.loadCategories();
        }
    }, [ready, userId, categoriesReady, categoriesLoading, categoriesError]);

    const names = (categories ?? []).map((category) => category.name);
    if (value && !names.some((name) => categoryNameKey(name) === categoryNameKey(value))) names.push(value);
    const filtered = names.filter((name) => categoryNameKey(name).includes(categoryNameKey(query)));
    const parsed = expenseCategoryRequestSchema.safeParse({ name: query });
    const canCreate = categoriesReady && !categoriesLoading && !categoriesError && parsed.success &&
        !names.some((name) => categoryNameKey(name) === categoryNameKey(query));
    const count = filtered.length + (canCreate ? 1 : 0);
    const activeIndex = Math.min(active, Math.max(0, count - 1));

    useEffect(() => {
        if (open && count > 0) {
            revealOption(options.current, activeIndex);
        }
    }, [activeIndex, open, count]);

    function choose(name: string) {
        onChange(name);
        returnFocus.current = true;
        setOpen(false);
        setFeedback("");
        setCreationFailed(false);
    }

    async function create() {
        if (pending.current || !canCreate || !parsed.success) return;
        pending.current = true;
        setSaving(true);
        onBusyChange(true);
        setFeedback("");
        setCreationFailed(false);
        try {
            const category = await financeActions.createCategory(parsed.data.name);
            if (!alive.current) return;
            onChange(category.name);
            returnFocus.current = true;
            setOpen(false);
            setFeedback(`Category "${category.name}" is ready to use.`);
        } catch (cause) {
            if (alive.current) {
                setCreationFailed(true);
                setFeedback(cause instanceof Error ? cause.message : "Unable to create the category. Please try again.");
            }
        } finally {
            pending.current = false;
            if (alive.current) {
                setSaving(false);
                onBusyChange(false);
            }
        }
    }

    function selectActive() {
        if (filtered[activeIndex]) choose(filtered[activeIndex]);
        else if (canCreate) void create();
    }

    return (
        <Popover.Root
            open={open}
            modal={false}
            onOpenChange={(nextOpen) => {
                if (pending.current && !nextOpen) return;
                returnFocus.current = false;
                setOpen(nextOpen);
            }}
        >
            <div
                className="min-w-0 space-y-1.5"
                onBlur={(event) => {
                    if (pending.current) return;
                    if (!event.currentTarget.contains(event.relatedTarget) && !options.current?.contains(event.relatedTarget)) {
                        if (event.relatedTarget) returnFocus.current = false;
                        setOpen(false);
                    }
                }}
            >
                <label htmlFor={id} className="block text-xs font-medium text-text-primary">
                    Category <span aria-hidden="true" className="text-danger">*</span>
                </label>
                <Popover.Anchor asChild>
                    <div ref={anchor} className="relative">
                        <Input
                            ref={input}
                            id={id}
                            role="combobox"
                            aria-autocomplete="list"
                            aria-expanded={open}
                            aria-controls={`${id}-options`}
                            aria-activedescendant={open && count > 0 ? `${id}-option-${activeIndex}` : undefined}
                            aria-describedby={`${id}-feedback`}
                            aria-invalid={Boolean(error)}
                            aria-required="true"
                            autoComplete="off"
                            disabled={saving}
                            value={open ? query : value}
                            placeholder={open ? "Search or create category" : "Select a category"}
                            onFocus={() => { setQuery(""); setActive(0); setOpen(true); }}
                            onClick={() => {
                                if (!open) { setQuery(""); setActive(0); setOpen(true); }
                            }}
                            onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }}
                            onKeyDown={(event) => {
                                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                                    event.preventDefault();
                                    setOpen(true);
                                    setActive((index) => open
                                        ? Math.max(0, Math.min(count - 1, index + (event.key === "ArrowDown" ? 1 : -1)))
                                        : (event.key === "ArrowDown" ? 0 : Math.max(0, count - 1)));
                                } else if (event.key === "Enter" && open) {
                                    event.preventDefault();
                                    if (count > 0 && !saving) selectActive();
                                } else if (event.key === "Escape" && open) {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    returnFocus.current = true;
                                    setOpen(false);
                                }
                            }}
                            className={cn("pr-9", error && "border-danger")}
                        />
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
                    </div>
                </Popover.Anchor>
                {open && (
                    <Popover.Portal>
                        <Popover.Content
                            ref={options}
                            id={`${id}-options`}
                            role="listbox"
                            aria-label="Expense categories"
                            aria-busy={categoriesLoading || saving}
                            side="bottom"
                            align="start"
                            sideOffset={4}
                            avoidCollisions
                            collisionPadding={12}
                            hideWhenDetached
                            onOpenAutoFocus={(event) => {
                                event.preventDefault();
                                revealOption(options.current, activeIndex);
                            }}
                            onCloseAutoFocus={(event) => {
                                event.preventDefault();
                                if (returnFocus.current) {
                                    returnFocus.current = false;
                                    input.current?.focus({ preventScroll: true });
                                    // Focusing the combobox must not reopen a just-selected list.
                                    setOpen(false);
                                }
                            }}
                            onInteractOutside={(event) => {
                                if (pending.current || anchor.current?.contains(event.target as Node)) event.preventDefault();
                            }}
                            onEscapeKeyDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                if (!pending.current) {
                                    returnFocus.current = true;
                                    setOpen(false);
                                }
                            }}
                            className="z-60 w-(--radix-popover-trigger-width) max-w-[calc(100vw-1.5rem)] max-h-[min(13rem,var(--radix-popover-content-available-height,13rem))] overflow-y-auto overscroll-contain rounded-md border border-border bg-surface-elevated p-1 outline-none"
                        >
                            {filtered.map((name, index) => (
                                <button
                                    key={name}
                                    id={`${id}-option-${index}`}
                                    role="option"
                                    aria-selected={categoryNameKey(value) === categoryNameKey(name)}
                                    tabIndex={-1}
                                    type="button"
                                    disabled={saving}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onPointerDown={(event) => event.preventDefault()}
                                    onClick={() => choose(name)}
                                    className={cn(
                                        "flex min-h-11 w-full items-center justify-between gap-2 rounded-sm px-2 text-left text-sm text-text-primary",
                                        activeIndex === index ? "bg-surface-hover" : "hover:bg-surface-hover",
                                    )}
                                >
                                    <span className="break-words">{name}</span>
                                    {categoryNameKey(value) === categoryNameKey(name) && <Check className="size-4 shrink-0" aria-hidden="true" />}
                                </button>
                            ))}
                            {canCreate && (
                                <button
                                    id={`${id}-option-${filtered.length}`}
                                    role="option"
                                    aria-selected="false"
                                    tabIndex={-1}
                                    type="button"
                                    disabled={saving}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onPointerDown={(event) => event.preventDefault()}
                                    onClick={() => void create()}
                                    className={cn(
                                        "min-h-11 w-full break-words rounded-sm px-2 text-left text-sm font-medium text-primary",
                                        activeIndex === filtered.length && "bg-surface-hover",
                                    )}
                                >
                                    {saving ? "Creating category..." : `+ Create "${cleanCategoryName(query)}"`}
                                </button>
                            )}
                            {categoriesLoading && <p role="status" className="p-2 text-xs text-text-secondary">Loading categories...</p>}
                            {categoriesError && (
                                <div className="p-2 text-xs text-danger">
                                    <p role="alert">{categoriesError}</p>
                                    <button type="button" disabled={saving} className="min-h-11 text-primary underline" onClick={() => void financeActions.loadCategories(true)}>
                                        Try again
                                    </button>
                                </div>
                            )}
                            {!categoriesLoading && !categoriesError && query && !parsed.success && (
                                <p className="p-2 text-xs text-text-secondary">{parsed.error.issues[0]?.message}</p>
                            )}
                        </Popover.Content>
                    </Popover.Portal>
                )}
                <p id={`${id}-feedback`} role={error || creationFailed ? "alert" : "status"} className={cn("text-xs", error || creationFailed ? "text-danger" : "text-text-secondary")}>
                    {error || feedback}
                </p>
            </div>
        </Popover.Root>
    );
}
