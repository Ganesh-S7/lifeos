"use client";

import { useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2 } from "lucide-react";
import {
    Button, Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, IconButton, Input,
} from "@/components/ui";
import { ExpenseCategoryCombobox } from "../../components/expenses/expense-category-combobox";
import { formatMonthlyMoney } from "../format";
import { notify } from "@/lib/notifications";
import { financeActions } from "../../store/finance-store";
import { putSpendingPlan } from "../api";
import { spendingPlanRequestSchema, sumMoney, type SpendingPlan } from "../contracts";

const formSchema = z.object({
    targets: z.array(z.object({ name: z.string(), amount: z.string().trim().min(1, "Enter an amount.").transform(Number) })),
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
    const { control, register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<z.input<typeof formSchema>, undefined, z.output<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: { targets: plan?.targets.map((target) => ({ ...target, amount: String(target.amount) })) ?? [] },
    });
    const { fields, append, remove } = useFieldArray({ control, name: "targets" });
    const targets = useWatch({ control, name: "targets" });
    const parsed = formSchema.safeParse({ targets });
    const total = parsed.success ? sumMoney(parsed.data.targets.map((target) => target.amount)) : null;
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
        } finally { lock.current = false; }
    }

    return (
        <Dialog open onOpenChange={(open) => { if (!open && !lock.current && !categoryBusy.current.size) onClose(); }}>
            <DialogContent
                className="max-w-150"
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    title.current?.focus({ preventScroll: true });
                }}
            >
                <DialogHeader>
                    <DialogTitle>
                        <span ref={title} tabIndex={-1} className="outline-none">Manage spending plan</span>
                    </DialogTitle>
                    <DialogDescription>Set your current monthly category targets. Changes do not alter historical spending or transactions.</DialogDescription>
                </DialogHeader>
                <form className="mt-5 space-y-4" onSubmit={(event) => handleSubmit(save)(event)}>
                    <fieldset disabled={busy} className="space-y-4">
                        {fields.length === 0 && <p className="text-sm text-text-secondary">No category targets yet. Add a category to start your plan.</p>}
                        {fields.map((field, index) => (
                            <div key={field.id} className="grid grid-cols-[minmax(0,1fr)_minmax(5rem,8rem)_auto] items-start gap-2">
                                <ExpenseCategoryCombobox
                                    value={targets[index]?.name ?? ""}
                                    onChange={(name) => setValue(`targets.${index}.name`, name, { shouldDirty: true, shouldValidate: true })}
                                    onBusyChange={(saving) => {
                                        if (saving) categoryBusy.current.add(field.id);
                                        else categoryBusy.current.delete(field.id);
                                        setBusyCategories(categoryBusy.current.size);
                                    }}
                                    error={errors.targets?.[index]?.name?.message}
                                />
                                <Input
                                    label="Target (₹)"
                                    inputMode="decimal"
                                    defaultValue={field.amount}
                                    {...register(`targets.${index}.amount`)}
                                    error={errors.targets?.[index]?.amount?.message}
                                />
                                <IconButton
                                    className="mt-5 text-danger"
                                    aria-label={`Remove ${targets[index]?.name || "category"} target`}
                                    onClick={() => remove(index)}
                                >
                                    <Trash2 className="size-4" aria-hidden="true" />
                                </IconButton>
                            </div>
                        ))}
                        <Button variant="outline" type="button" disabled={fields.length >= 100} onClick={() => append({ name: "", amount: "0" })}>
                            <Plus className="mr-2 size-4" aria-hidden="true" /> Add category target
                        </Button>
                        <p className="text-sm font-medium text-text-primary" role="status">Ideal monthly total: {total === null ? "Enter valid, unique targets" : formatMonthlyMoney(total)}</p>
                        {(error || errors.targets?.root?.message) && <p role="alert" className="text-sm text-danger">{error || errors.targets?.root?.message}</p>}
                        <DialogFooter>
                            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
                            <Button type="submit" disabled={busy}>{isSubmitting ? "Saving..." : "Save plan"}</Button>
                        </DialogFooter>
                    </fieldset>
                </form>
            </DialogContent>
        </Dialog>
    );
}
