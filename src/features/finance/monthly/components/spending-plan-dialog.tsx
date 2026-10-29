"use client";

import { useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2 } from "lucide-react";
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    IconButton,
    Input,
} from "@/components/ui";
import { ExpenseCategoryCombobox } from "../../components/expenses/expense-category-combobox";
import { formatMonthlyMoney } from "../format";
import { notify } from "@/lib/notifications";
import { financeActions } from "../../store/finance-store";
import { putSpendingPlan } from "../api";
import { spendingPlanRequestSchema, sumMoney, type SpendingPlan } from "../contracts";

const formSchema = z.object({
    targets: z.array(z.object({
        name: z.string(),
        amount: z.string().trim().min(1, "Enter an amount.").transform(Number),
    })),
}).pipe(spendingPlanRequestSchema);

interface Props {
    plan: SpendingPlan | null;
    onClose: () => void;
    onSaved: (plan: SpendingPlan) => void;
}

/** Mounted fresh on each open, so cancel never mutates the saved plan. */
export function SpendingPlanDialog({ plan, onClose, onSaved }: Props) {
    const lock = useRef(false);
    const title = useRef<HTMLSpanElement>(null);
    const categoryBusy = useRef(new Set<string>());
    const [busyCategories, setBusyCategories] = useState(0);
    const [error, setError] = useState("");
    const {
        control, register, handleSubmit, setValue,
        formState: { errors, isSubmitting },
    } = useForm<z.input<typeof formSchema>, undefined, z.output<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            targets: plan?.targets.map((target) => ({
                ...target,
                amount: String(target.amount),
            })) ?? [],
        },
    });
    const { fields, append, remove } = useFieldArray({ control, name: "targets" });
    const targets = useWatch({ control, name: "targets" });
    const parsed = formSchema.safeParse({ targets });
    const total = parsed.success ? sumMoney(parsed.data.targets.map((target) => target.amount)) : null;
    const referenceIncome = plan?.referenceIncome ?? null;
    const buffer = total !== null && referenceIncome !== null
        ? sumMoney([referenceIncome, -total])
        : null;
    const busy = isSubmitting || busyCategories > 0;

    async function save(input: z.output<typeof formSchema>) {
        if (lock.current || categoryBusy.current.size) return;
        lock.current = true;
        setError("");
        try {
            const saved = await putSpendingPlan(input);
            onSaved(saved);
            void financeActions.loadCategories(true);
            notify.success("Spending plan saved.");
            onClose();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Unable to save the spending plan.");
        } finally {
            lock.current = false;
        }
    }

    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open && !lock.current && !categoryBusy.current.size) onClose();
            }}
        >
            <DialogContent
                className="flex max-h-[calc(100dvh-2rem)] max-w-200 flex-col overflow-hidden p-0"
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    title.current?.focus({ preventScroll: true });
                }}
            >
                <DialogHeader className="shrink-0 px-4 pt-5 pr-12 sm:px-6 sm:pr-12">
                    <DialogTitle>
                        <span ref={title} tabIndex={-1} className="outline-none">
                            Manage spending plan
                        </span>
                    </DialogTitle>
                    <DialogDescription>
                        Set your current monthly category targets. Changes do not alter
                        historical spending or transactions.
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="flex min-h-0 flex-col"
                    onSubmit={(event) => handleSubmit(save)(event)}
                >
                    <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-6">
                        <p className="text-xs text-text-secondary" aria-live="polite">
                            {fields.length} {fields.length === 1 ? "category" : "categories"}
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            disabled={busy || fields.length >= 100}
                            onClick={() => append({ name: "", amount: "0" })}
                        >
                            <Plus className="size-4" aria-hidden="true" />
                            Add category
                        </Button>
                    </div>
                    <div className="min-h-0 overflow-y-auto overscroll-contain border-y border-border px-4 sm:px-6">
                        <fieldset disabled={busy} className="min-w-0">
                            <legend className="sr-only">Monthly category targets</legend>
                            <table className="w-full table-fixed border-collapse text-sm">
                                <caption className="sr-only">Editable monthly spending targets in rupees</caption>
                                <thead className="sticky top-0 z-10 bg-surface">
                                    <tr className="text-xs text-text-secondary">
                                        <th scope="col" className="py-2.5 pr-2 text-left font-medium">Category</th>
                                        <th scope="col" className="w-28 py-2.5 pr-2 text-right font-medium sm:w-44">
                                            Monthly target <span className="whitespace-nowrap">(₹)</span>
                                        </th>
                                        <th scope="col" className="w-11 py-2.5 text-center font-medium sm:w-12">
                                            <span className="sr-only sm:not-sr-only">Actions</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {fields.length === 0 && (
                                        <tr>
                                            <td colSpan={3} className="py-8 text-center text-sm text-text-secondary">
                                                No category targets yet. Add a category to start your plan.
                                            </td>
                                        </tr>
                                    )}
                                    {fields.map((field, index) => (
                                        <tr key={field.id} className="align-top">
                                            <td className="py-2 pr-2">
                                                <ExpenseCategoryCombobox
                                                    compact
                                                    label={`Category for target ${index + 1}`}
                                                    value={targets[index]?.name ?? ""}
                                                    onChange={(name) => setValue(`targets.${index}.name`, name, {
                                                        shouldDirty: true,
                                                        shouldValidate: true,
                                                    })}
                                                    onBusyChange={(saving) => {
                                                        if (saving) categoryBusy.current.add(field.id);
                                                        else categoryBusy.current.delete(field.id);
                                                        setBusyCategories(categoryBusy.current.size);
                                                    }}
                                                    error={errors.targets?.[index]?.name?.message}
                                                />
                                            </td>
                                            <td className="py-2 pr-2">
                                                <Input
                                                    aria-label={`Monthly target for ${targets[index]?.name || `row ${index + 1}`} in rupees`}
                                                    className="px-2 text-right tabular-nums sm:h-9 sm:px-3"
                                                    inputMode="decimal"
                                                    defaultValue={field.amount}
                                                    {...register(`targets.${index}.amount`)}
                                                    error={errors.targets?.[index]?.amount?.message}
                                                />
                                            </td>
                                            <td className="py-2 text-center">
                                                <IconButton
                                                    className="text-text-muted hover:text-danger"
                                                    aria-label={`Remove ${targets[index]?.name || "category"} target`}
                                                    onClick={() => remove(index)}
                                                >
                                                    <Trash2 className="size-4" aria-hidden="true" />
                                                </IconButton>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </fieldset>
                    </div>
                    <div className="shrink-0 space-y-2 px-4 py-3 sm:px-6 sm:py-4">
                        <div className="flex flex-wrap items-end justify-between gap-3">
                            <div role="status" aria-atomic="true" className="min-w-0 space-y-1">
                                <p className="text-xs text-text-secondary">Planned monthly spending</p>
                                <p className="text-xl font-semibold tracking-tight text-text-primary tabular-nums">
                                    {total === null ? "Enter valid, unique targets" : formatMonthlyMoney(total)}
                                </p>
                            </div>
                            <DialogFooter className="mt-0 flex-row justify-end">
                                <Button variant="outline" type="button" disabled={busy} onClick={onClose}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={busy}>
                                    {isSubmitting ? "Saving..." : "Save plan"}
                                </Button>
                            </DialogFooter>
                        </div>
                        {referenceIncome !== null && (
                            <p role="status" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
                                <span>Salary reference: {formatMonthlyMoney(referenceIncome)}</span>
                                <span className={buffer !== null && buffer < 0 ? "text-danger" : undefined}>
                                    Planned buffer: {buffer === null ? "Unavailable" : formatMonthlyMoney(buffer)}
                                </span>
                            </p>
                        )}
                        {(error || errors.targets?.root?.message) && (
                            <p role="alert" className="text-sm text-danger">
                                {error || errors.targets?.root?.message}
                            </p>
                        )}
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
