"use client";

import { useState } from "react";

import { Button, DeleteModal } from "@/components/ui";

import { formatDateDisplay } from "@/lib/utils/date";

import {
    healthActions,
} from "../store/health-actions";

import {
    useHealthHydration,
    useHealthStore,
} from "../store/health-store";

import type { HealthLog } from "../types/health";

import {
    getLatestSleepLog,
    getLatestWeightLog,
    getRecentHealthLogs,
    getTodayDateKey,
    getTodayHealthLog,
    getTodayHealthProgress,
} from "../utils/health-calculations";

import { HealthLogDialog } from "./health-log-dialog";
import { HealthProgress } from "./health-progress";
import { HealthSummary } from "./health-summary";
import { RecentHealthLogs } from "./recent-health-logs";
import { ManageHealthTargetsDialog } from "./manage-health-targets-dialog";
import { HealthAnalytics } from "./health-analytics";

export function HealthOverview() {
    useHealthHydration();

    const logs = useHealthStore((state) => state.logs);
    const targets = useHealthStore((state) => state.targets);
    const ready = useHealthStore((state) => state.ready);

    const [logDialogOpen, setLogDialogOpen] = useState(false);
    const [targetsDialogOpen, setTargetsDialogOpen] = useState(false);
    const [selectedProgressDate, setSelectedProgressDate] = useState(
        () => getTodayDateKey(),
    );
    const [editingLog, setEditingLog] =
        useState<HealthLog | null>(null);

    const [deleteTarget, setDeleteTarget] =
        useState<HealthLog | null>(null);

    const [pageError, setPageError] = useState("");

    const today = getTodayDateKey();

    const todayLog = getTodayHealthLog(logs, today);
    const latestWeight = getLatestWeightLog(logs);
    const latestSleep = getLatestSleepLog(logs);

    const recentLogs = getRecentHealthLogs(logs, 5);

    const selectedProgressLog = getTodayHealthLog(
        logs,
        selectedProgressDate,
    );

    const progress = getTodayHealthProgress(
        selectedProgressLog,
        targets,
    );

    function openAddLog() {
        setEditingLog(null);
        setPageError("");
        setLogDialogOpen(true);
    }

    function openEditLog(log: HealthLog) {
        setEditingLog(log);
        setPageError("");
        setLogDialogOpen(true);
    }

    function handleLogDialogChange(open: boolean) {
        setLogDialogOpen(open);

        if (!open) {
            setEditingLog(null);
        }
    }

    function handleDeleteLog() {
        if (!deleteTarget) {
            return;
        }

        try {
            healthActions.deleteLog(deleteTarget.id);

            setPageError("");
        } catch (cause) {
            setPageError(
                cause instanceof Error
                    ? cause.message
                    : "Unable to delete the health log. Please try again.",
            );
        } finally {
            setDeleteTarget(null);
        }
    }

    return (
        <div className="space-y-7">
            {/* Page header */}
            <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
                        Health overview
                    </h1>

                    <p className="mt-1 text-sm text-text-secondary">
                        Track your body measurements, activity,
                        sleep, nutrition, and hydration.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2 sm:justify-end">
                    <button
                        type="button"
                        onClick={() => setTargetsDialogOpen(true)}
                        className="rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-elevated"
                    >
                        Manage targets
                    </button>

                    <Button
                        type="button"
                        onClick={openAddLog}
                    >
                        Add health log
                    </Button>
                </div>
            </header>

            {pageError && (
                <p
                    role="alert"
                    className="rounded-lg bg-danger-subtle p-3 text-sm text-danger"
                >
                    {pageError}
                </p>
            )}

            {!ready ? (
                <div className="rounded-2xl border border-border bg-surface p-6">
                    <p className="text-sm text-text-secondary">
                        Loading your health data…
                    </p>
                </div>
            ) : (
                <>
                    <HealthSummary
                        latestWeight={latestWeight}
                        latestSleep={latestSleep}
                        todayLog={todayLog}
                        targets={targets}
                    />

                    <HealthProgress
                        metrics={progress}
                        selectedDate={selectedProgressDate}
                        todayDate={today}
                        onSelectedDateChange={setSelectedProgressDate}
                        onManageTargets={() => setTargetsDialogOpen(true)}
                    />

                    <HealthAnalytics logs={logs} />

                    <RecentHealthLogs
                        logs={recentLogs}
                        onAdd={openAddLog}
                        onEdit={openEditLog}
                        onDelete={setDeleteTarget}
                    />
                </>
            )}

            {/* Add / edit health log */}
            <HealthLogDialog
                open={logDialogOpen}
                onOpenChange={handleLogDialogChange}
                editLog={editingLog}
            />

            {/* Manage targets */}
            <ManageHealthTargetsDialog
                open={targetsDialogOpen}
                onOpenChange={setTargetsDialogOpen}
                targets={targets}
            />

            {/* Delete confirmation */}
            <DeleteModal
                open={deleteTarget !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setDeleteTarget(null);
                    }
                }}
                title={`Delete health log${deleteTarget
                    ? ` for ${formatDateDisplay(deleteTarget.date)}`
                    : ""
                    }?`}
                description="This will permanently delete this health log and all its recorded measurements."
                confirmText="Delete"
                onConfirm={handleDeleteLog}
            />
        </div>
    );
}