"use client";

import { useEffect, useMemo, useState } from "react";
import {
    Controller,
    useForm,
    useWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
    Button,
    DatePicker,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
} from "@/components/ui";

import {
    formatDateValue,
    parseDateValue,
} from "@/lib/utils/date";

import { healthActions } from "../store/health-actions";
import { useHealthStore } from "../store/health-store";

import type { HealthLog } from "../types/health";

import {
    createHealthLogSchema,
} from "../schemas/health-log-schema";

interface HealthLogDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editLog?: HealthLog | null;
}

type HealthLogSchema = ReturnType<typeof createHealthLogSchema>;

type HealthLogFormInput = z.input<HealthLogSchema>;
type HealthLogFormOutput = z.output<HealthLogSchema>;

type HealthLogTab = "body" | "nutrition";

/* -------------------------------------------------------------------------- */
/* Form defaults                                                              */
/* -------------------------------------------------------------------------- */

function getDefaultValues(
    log?: HealthLog | null,
    dateOverride?: string,
): HealthLogFormInput {
    return {
        date:
            dateOverride ??
            log?.date ??
            formatDateValue(new Date()),

        weightKg:
            log?.weightKg !== undefined
                ? String(log.weightKg)
                : "",

        steps:
            log?.steps !== undefined
                ? String(log.steps)
                : "",

        sleepHours:
            log?.sleepMinutes !== undefined
                ? String(
                    Number(
                        (log.sleepMinutes / 60).toFixed(3),
                    ),
                )
                : "",

        waterLitres:
            log?.waterMl !== undefined
                ? String(log.waterMl / 1000)
                : "",

        caloriesKcal:
            log?.caloriesKcal !== undefined
                ? String(log.caloriesKcal)
                : "",

        proteinGrams:
            log?.proteinGrams !== undefined
                ? String(log.proteinGrams)
                : "",

        carbsGrams:
            log?.carbsGrams !== undefined
                ? String(log.carbsGrams)
                : "",

        fiberGrams:
            log?.fiberGrams !== undefined
                ? String(log.fiberGrams)
                : "",
    };
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export function HealthLogDialog({
    open,
    onOpenChange,
    editLog,
}: HealthLogDialogProps) {
    const [activeTab, setActiveTab] =
        useState<HealthLogTab>("body");

    const logs = useHealthStore((state) => state.logs);

    const schema = useMemo(
        () => createHealthLogSchema(formatDateValue(new Date())),
        [],
    );

    const {
        register,
        control,
        handleSubmit,
        reset,
        clearErrors,
        setError,
        formState: {
            errors,
            isSubmitting,
        },
    } = useForm<
        HealthLogFormInput,
        undefined,
        HealthLogFormOutput
    >({
        resolver: zodResolver(schema),
        defaultValues: getDefaultValues(editLog),

        // Keep values for fields that are temporarily hidden.
        shouldUnregister: false,

        mode: "onSubmit",
        reValidateMode: "onChange",
    });

    const selectedDate = useWatch({
        control,
        name: "date",
    });

    /*
     * Find the saved record corresponding to the currently selected date.
     *
     * This also makes Add Health Log reopen today's existing entry
     * instead of starting with an empty form.
     */
    const selectedDateLog = selectedDate
        ? logs.find((log) => log.date === selectedDate)
        : undefined;

    const currentLog =
        selectedDateLog ??
        (editLog?.date === selectedDate ? editLog : undefined);

    const isEditing = Boolean(currentLog);

    /* ---------------------------------------------------------------------- */
    /* Load the correct record when the dialog opens                          */
    /* ---------------------------------------------------------------------- */

    useEffect(() => {
        if (!open) {
            return;
        }

        const initialDate =
            editLog?.date ?? formatDateValue(new Date());

        // Read the latest store value when opening the dialog.
        // This avoids relying on a potentially stale prop.
        const storedLog = useHealthStore
            .getState()
            .logs.find((log) => log.date === initialDate);

        const logToLoad = storedLog ?? editLog ?? null;

        reset(
            getDefaultValues(
                logToLoad,
                initialDate,
            ),
        );

        clearErrors();
    }, [open, editLog, reset, clearErrors]);

    /* ---------------------------------------------------------------------- */
    /* Handle date changes                                                    */
    /* ---------------------------------------------------------------------- */

    function clearSaveError() {
        clearErrors("root.server");
    }

    function handleDialogOpenChange(nextOpen: boolean) {
        if (!nextOpen) {
            setActiveTab("body");
        }

        onOpenChange(nextOpen);
    }

    function handleDateChange(
        nextDate: Date | null,
        currentDate: string,
        onChange: (value: string) => void,
    ) {
        if (!nextDate) {
            onChange("");
            clearErrors();
            return;
        }

        const nextDateKey = formatDateValue(nextDate);

        // Do not reset unsaved inputs if the selected date hasn't changed.
        if (nextDateKey === currentDate) {
            return;
        }

        /*
         * Selecting a different date loads that day's saved measurements.
         * If no record exists for the selected date, the form starts blank.
         */
        const existingLog = useHealthStore
            .getState()
            .logs.find((log) => log.date === nextDateKey);

        reset(
            getDefaultValues(
                existingLog ?? null,
                nextDateKey,
            ),
        );

        clearErrors();
    }

    /* ---------------------------------------------------------------------- */
    /* Save                                                                    */
    /* ---------------------------------------------------------------------- */

    const onSubmit = handleSubmit(async (values) => {
        try {
            /*
             * Resolve the record by the submitted date.
             *
             * If a record already exists, update that record. Otherwise,
             * retain the original ID when editing and moving a log to a
             * different, previously unused date.
             */
            const storedLogForDate = useHealthStore
                .getState()
                .logs.find((log) => log.date === values.date);

            await healthActions.saveLog({
                ...values,
                id: storedLogForDate?.id ?? editLog?.id,
            });

            handleDialogOpenChange(false);
        } catch (cause) {
            setError("root.server", {
                type: "server",
                message:
                    cause instanceof Error
                        ? cause.message
                        : "Unable to save your health log. Please try again.",
            });
        }
    });

    return (
        <Dialog
            open={open}
            onOpenChange={handleDialogOpenChange}
        >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>
                        {isEditing
                            ? "Edit health log"
                            : "Add health log"}
                    </DialogTitle>

                    <DialogDescription>
                        Record your activity, body measurements,
                        nutrition, and hydration for a specific day.
                    </DialogDescription>
                </DialogHeader>

                <form
                    onSubmit={onSubmit}
                    noValidate
                    className="mt-5"
                >
                    {/* Shared date field */}

                    <Controller
                        name="date"
                        control={control}
                        render={({ field }) => (
                            <DatePicker
                                id="health-log-date"
                                label="Log date"
                                placeholder="Select a date"
                                value={
                                    field.value
                                        ? parseDateValue(field.value)
                                        : null
                                }
                                onChange={(date) =>
                                    handleDateChange(
                                        date,
                                        field.value,
                                        field.onChange,
                                    )
                                }
                                error={errors.date?.message}
                                required
                            />
                        )}
                    />

                    {/* Tabs */}

                    <div
                        role="tablist"
                        aria-label="Health log categories"
                        className="mt-6 flex border-b border-border"
                    >
                        <button
                            type="button"
                            role="tab"
                            id="health-body-tab"
                            aria-selected={activeTab === "body"}
                            aria-controls="health-body-panel"
                            onClick={() => setActiveTab("body")}
                            className={`flex-1 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === "body"
                                    ? "text-text-primary"
                                    : "text-text-secondary hover:text-text-primary"
                                }`}
                            style={{
                                borderBottomColor:
                                    activeTab === "body"
                                        ? "var(--brand)"
                                        : "transparent",
                            }}
                        >
                            Body & Activity
                        </button>

                        <button
                            type="button"
                            role="tab"
                            id="health-nutrition-tab"
                            aria-selected={activeTab === "nutrition"}
                            aria-controls="health-nutrition-panel"
                            onClick={() => setActiveTab("nutrition")}
                            className={`flex-1 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === "nutrition"
                                    ? "text-text-primary"
                                    : "text-text-secondary hover:text-text-primary"
                                }`}
                            style={{
                                borderBottomColor:
                                    activeTab === "nutrition"
                                        ? "var(--brand)"
                                        : "transparent",
                            }}
                        >
                            Nutrition & Hydration
                        </button>
                    </div>

                    {/*
                     * IMPORTANT:
                     * Both panels remain mounted.
                     *
                     * Only their visibility changes. This ensures that
                     * switching tabs never removes the input components
                     * from the React Hook Form instance.
                     */}

                    {/* Body & Activity panel */}

                    <div
                        id="health-body-panel"
                        role="tabpanel"
                        aria-labelledby="health-body-tab"
                        hidden={activeTab !== "body"}
                        className="mt-5"
                    >
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <Input
                                label="Weight"
                                type="number"
                                placeholder="e.g. 72.5"
                                min="0"
                                step="0.1"
                                {...register("weightKg", {
                                    onChange: clearSaveError,
                                })}
                                error={errors.weightKg?.message}
                                inputMode="decimal"
                            />

                            <Input
                                label="Steps"
                                type="number"
                                placeholder="e.g. 8500"
                                min="0"
                                step="1"
                                {...register("steps", {
                                    onChange: clearSaveError,
                                })}
                                error={errors.steps?.message}
                                inputMode="numeric"
                            />

                            <Input
                                label="Sleep duration (hours)"
                                type="number"
                                placeholder="e.g. 7.5"
                                min="0"
                                max="24"
                                step="0.25"
                                {...register("sleepHours", {
                                    onChange: clearSaveError,
                                })}
                                error={errors.sleepHours?.message}
                                inputMode="decimal"
                            />
                        </div>
                    </div>

                    {/* Nutrition & Hydration panel */}

                    <div
                        id="health-nutrition-panel"
                        role="tabpanel"
                        aria-labelledby="health-nutrition-tab"
                        hidden={activeTab !== "nutrition"}
                        className="mt-5"
                    >
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <Input
                                label="Water intake (litres)"
                                type="number"
                                placeholder="e.g. 2.5"
                                min="0"
                                step="0.1"
                                {...register("waterLitres", {
                                    onChange: clearSaveError,
                                })}
                                error={errors.waterLitres?.message}
                                inputMode="decimal"
                            />

                            <Input
                                label="Calories (kcal)"
                                type="number"
                                placeholder="e.g. 2100"
                                min="0"
                                step="1"
                                {...register("caloriesKcal", {
                                    onChange: clearSaveError,
                                })}
                                error={errors.caloriesKcal?.message}
                                inputMode="numeric"
                            />

                            <Input
                                label="Protein (g)"
                                type="number"
                                placeholder="e.g. 120"
                                min="0"
                                step="0.1"
                                {...register("proteinGrams", {
                                    onChange: clearSaveError,
                                })}
                                error={errors.proteinGrams?.message}
                                inputMode="decimal"
                            />

                            <Input
                                label="Carbs (g)"
                                type="number"
                                placeholder="e.g. 250"
                                min="0"
                                step="0.1"
                                {...register("carbsGrams", {
                                    onChange: clearSaveError,
                                })}
                                error={errors.carbsGrams?.message}
                                inputMode="decimal"
                            />

                            <Input
                                label="Fiber (g)"
                                type="number"
                                placeholder="e.g. 30"
                                min="0"
                                step="0.1"
                                {...register("fiberGrams", {
                                    onChange: clearSaveError,
                                })}
                                error={errors.fiberGrams?.message}
                                inputMode="decimal"
                            />
                        </div>
                    </div>

                    {/* Form-level error */}

                    {errors.root?.server?.message && (
                        <p
                            role="alert"
                            className="mt-4 rounded-lg bg-danger-subtle p-3 text-sm text-danger"
                        >
                            {errors.root.server.message}
                        </p>
                    )}

                    {/* Shared footer */}

                    <DialogFooter className="mt-6 border-t border-border pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={isSubmitting}
                            onClick={() =>
                                handleDialogOpenChange(false)
                            }
                        >
                            Cancel
                        </Button>

                        <Button
                            type="submit"
                            disabled={isSubmitting}
                        >
                            {isSubmitting
                                ? "Saving..."
                                : isEditing
                                    ? "Save changes"
                                    : "Save health log"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}