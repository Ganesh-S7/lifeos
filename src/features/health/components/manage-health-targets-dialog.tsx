"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
} from "@/components/ui";

import { healthActions } from "../store/health-actions";
import type { HealthTargets } from "../types/health";
import { healthTargetsSchema } from "../schemas/health-targets-schema";
import { notify } from "@/lib/notifications";

interface ManageHealthTargetsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    targets: HealthTargets | null;
}

type TargetsFormInput = z.input<typeof healthTargetsSchema>;
type TargetsFormOutput = z.output<typeof healthTargetsSchema>;

type TargetsTab = "body" | "nutrition";

function getDefaultValues(
    targets: HealthTargets | null,
): TargetsFormInput {
    return {
        weightGoalKg:
            targets?.weightGoalKg !== undefined
                ? String(targets.weightGoalKg)
                : "",

        stepsPerDay:
            targets?.stepsPerDay !== undefined
                ? String(targets.stepsPerDay)
                : "",

        sleepHoursPerDay:
            targets?.sleepMinutesPerDay !== undefined
                ? String(targets.sleepMinutesPerDay / 60)
                : "",

        waterLitresPerDay:
            targets?.waterMlPerDay !== undefined
                ? String(targets.waterMlPerDay / 1000)
                : "",

        caloriesKcalPerDay:
            targets?.caloriesKcalPerDay !== undefined
                ? String(targets.caloriesKcalPerDay)
                : "",

        proteinGramsPerDay:
            targets?.proteinGramsPerDay !== undefined
                ? String(targets.proteinGramsPerDay)
                : "",

        carbsGramsPerDay:
            targets?.carbsGramsPerDay !== undefined
                ? String(targets.carbsGramsPerDay)
                : "",

        fiberGramsPerDay:
            targets?.fiberGramsPerDay !== undefined
                ? String(targets.fiberGramsPerDay)
                : "",
    };
}

export function ManageHealthTargetsDialog({
    open,
    onOpenChange,
    targets,
}: ManageHealthTargetsDialogProps) {
    const [activeTab, setActiveTab] = useState<TargetsTab>("body");
    const [isClearing, setIsClearing] = useState(false);

    const {
        register,
        handleSubmit,
        reset,
        clearErrors,
        setError,
        formState: {
            errors,
            isSubmitting,
        },
    } = useForm<
        TargetsFormInput,
        undefined,
        TargetsFormOutput
    >({
        resolver: zodResolver(healthTargetsSchema),
        defaultValues: getDefaultValues(targets),
        mode: "onSubmit",
        reValidateMode: "onChange",
    });
    const isBusy = isSubmitting || isClearing;

    useEffect(() => {
        if (!open) {
            return;
        }

        reset(getDefaultValues(targets));
        clearErrors();
    }, [open, targets, reset, clearErrors]);

    function clearSaveError() {
        clearErrors("root.server");
    }

    function handleDialogOpenChange(nextOpen: boolean) {
        if (!nextOpen) {
            setActiveTab("body");
        }

        onOpenChange(nextOpen);
    }

    const onSubmit = handleSubmit(async (values) => {
        try {
            await healthActions.saveTargets(values);
            notify.success("Health targets updated.");
            handleDialogOpenChange(false);
        } catch (cause) {
            notify.error("Unable to update your health targets.", {
                description: "Review the form and try again. Your targets have not changed.",
            });
            setError("root.server", {
                type: "server",
                message:
                    cause instanceof Error
                        ? cause.message
                        : "Unable to save your targets. Please try again.",
            });
        }
    });

    async function handleClearTargets() {
        if (isBusy) return;
        setIsClearing(true);
        clearSaveError();
        try {
            await healthActions.clearTargets();
            notify.success("Health targets cleared.");
            handleDialogOpenChange(false);
        } catch {
            const message = "Unable to clear your targets. Please try again.";
            setError("root.server", { type: "server", message });
            notify.error(message);
        } finally {
            setIsClearing(false);
        }
    }

    const hasSavedTargets = targets !== null;

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!isBusy) handleDialogOpenChange(nextOpen);
            }}
        >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>
                        Manage health targets
                    </DialogTitle>

                    <DialogDescription>
                        Set personal goals to track your daily
                        activity, nutrition, and hydration.
                        Every target is optional.
                    </DialogDescription>
                </DialogHeader>

                <form
                    onSubmit={onSubmit}
                    noValidate
                    className="mt-5"
                >
                    {/* Tabs */}
                    <div
                        role="tablist"
                        aria-label="Health target categories"
                        className="flex border-b border-border"
                    >
                        <button
                            type="button"
                            role="tab"
                            id="health-targets-body-tab"
                            aria-selected={activeTab === "body"}
                            aria-controls="health-targets-tabpanel"
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
                            id="health-targets-nutrition-tab"
                            aria-selected={activeTab === "nutrition"}
                            aria-controls="health-targets-tabpanel"
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

                    {/* Tab content */}
                    <div
                        id="health-targets-tabpanel"
                        role="tabpanel"
                        aria-labelledby={
                            activeTab === "body"
                                ? "health-targets-body-tab"
                                : "health-targets-nutrition-tab"
                        }
                        className="mt-5"
                    >
                        {activeTab === "body" ? (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Input
                                    label="Weight goal (kg)"
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    placeholder="e.g. 70"
                                    {...register("weightGoalKg", {
                                        onChange: clearSaveError,
                                    })}
                                    error={errors.weightGoalKg?.message}
                                    inputMode="decimal"
                                />

                                <Input
                                    label="Daily steps"
                                    type="number"
                                    min="0"
                                    step="1"
                                    placeholder="e.g. 8000"
                                    {...register("stepsPerDay", {
                                        onChange: clearSaveError,
                                    })}
                                    error={errors.stepsPerDay?.message}
                                    inputMode="numeric"
                                />

                                <Input
                                    label="Sleep duration (hours/day)"
                                    type="number"
                                    min="0"
                                    max="24"
                                    step="0.25"
                                    placeholder="e.g. 8"
                                    {...register("sleepHoursPerDay", {
                                        onChange: clearSaveError,
                                    })}
                                    error={errors.sleepHoursPerDay?.message}
                                    inputMode="decimal"
                                />
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Input
                                    label="Water intake (litres/day)"
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    placeholder="e.g. 2.5"
                                    {...register("waterLitresPerDay", {
                                        onChange: clearSaveError,
                                    })}
                                    error={errors.waterLitresPerDay?.message}
                                    inputMode="decimal"
                                />

                                <Input
                                    label="Calories (kcal/day)"
                                    type="number"
                                    min="0"
                                    step="1"
                                    placeholder="e.g. 2000"
                                    {...register("caloriesKcalPerDay", {
                                        onChange: clearSaveError,
                                    })}
                                    error={errors.caloriesKcalPerDay?.message}
                                    inputMode="numeric"
                                />

                                <Input
                                    label="Protein (g/day)"
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    placeholder="e.g. 120"
                                    {...register("proteinGramsPerDay", {
                                        onChange: clearSaveError,
                                    })}
                                    error={errors.proteinGramsPerDay?.message}
                                    inputMode="decimal"
                                />

                                <Input
                                    label="Carbs (g/day)"
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    placeholder="e.g. 250"
                                    {...register("carbsGramsPerDay", {
                                        onChange: clearSaveError,
                                    })}
                                    error={errors.carbsGramsPerDay?.message}
                                    inputMode="decimal"
                                />

                                <Input
                                    label="Fiber (g/day)"
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    placeholder="e.g. 30"
                                    {...register("fiberGramsPerDay", {
                                        onChange: clearSaveError,
                                    })}
                                    error={errors.fiberGramsPerDay?.message}
                                    inputMode="decimal"
                                />
                            </div>
                        )}
                    </div>

                    {errors.root?.server?.message && (
                        <p
                            role="alert"
                            className="mt-4 rounded-lg bg-danger-subtle p-3 text-sm text-danger"
                        >
                            {errors.root.server.message}
                        </p>
                    )}

                    <DialogFooter className="mt-6 border-t border-border pt-4">
                        {hasSavedTargets && (
                            <Button
                                type="button"
                                variant="outline"
                                disabled={isBusy}
                                onClick={handleClearTargets}
                            >
                                {isClearing ? "Clearing..." : "Clear targets"}
                            </Button>
                        )}

                        <Button
                            type="button"
                            variant="outline"
                            disabled={isBusy}
                            onClick={() => handleDialogOpenChange(false)}
                        >
                            Cancel
                        </Button>

                        <Button
                            type="submit"
                            disabled={isBusy}
                        >
                            {isSubmitting ? "Saving..." : "Save targets"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
