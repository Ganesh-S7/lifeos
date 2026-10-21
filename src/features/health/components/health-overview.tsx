"use client";

import { useState } from "react";

import { Button, DeleteModal, LoadError } from "@/components/ui";

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
import { authClient } from "@/lib/auth-client";
import { notify } from "@/lib/notifications";
import { HealthOverviewSkeleton } from "./health-overview-skeleton";

export function HealthOverview() {

    const {
        data: session,
        isPending: sessionPending,
    } = authClient.useSession();

    useHealthHydration(
        session?.user.id,
        sessionPending,
    );

    const loadError = useHealthStore(
        (state) => state.loadError,
    );

    const initializeForUser = useHealthStore(
        (state) => state.initializeForUser,
    );

    const logs = useHealthStore((state) => state.logs);
    const targets = useHealthStore((state) => state.targets);
    const ready = useHealthStore((state) => state.ready);
    const activeUserId = useHealthStore((state) => state.activeUserId);
    const initialLoading = !ready || Boolean(
        session?.user.id && activeUserId !== session.user.id,
    );

    const [logDialogOpen, setLogDialogOpen] = useState(false);
    const [targetsDialogOpen, setTargetsDialogOpen] = useState(false);
    // `null` means the date is chosen automatically from available logs.
    // Once the user navigates dates, their selection is preserved.
    const [selectedProgressDate, setSelectedProgressDate] =
        useState<string | null>(null);
    const [editingLog, setEditingLog] =
        useState<HealthLog | null>(null);

    const [deleteTarget, setDeleteTarget] =
        useState<HealthLog | null>(null);

    const [pageError, setPageError] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);

    const today = getTodayDateKey();

    const latestLogDate = [...logs]
        .sort((a, b) => b.date.localeCompare(a.date))[0]?.date;

    // Start on today when there's a log for today. Otherwise, show the
    // most recent day with a log instead of an empty progress view.
    const defaultProgressDate = logs.some((log) => log.date === today)
        ? today
        : latestLogDate ?? today;

    const activeProgressDate = selectedProgressDate ?? defaultProgressDate;

    const todayLog = getTodayHealthLog(logs, today);
    const latestWeight = getLatestWeightLog(logs);
    const latestSleep = getLatestSleepLog(logs);

    const recentLogs = getRecentHealthLogs(logs, 5);

    const selectedProgressLog = getTodayHealthLog(
        logs,
        activeProgressDate,
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

    async function handleDeleteLog() {
        if (!deleteTarget || isDeleting) {
            return;
        }

        setIsDeleting(true);
        try {
            await healthActions.deleteLog(deleteTarget.id);

            setPageError("");
            notify.success("Health log deleted.");
        } catch (cause) {
            setPageError(
                cause instanceof Error
                    ? cause.message
                    : "Unable to delete the health log. Please try again.",
            );
            notify.error("Unable to delete the health log.", {
                description: "Please try again. The log has not been deleted.",
            });
        } finally {
            setIsDeleting(false);
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
                        disabled={initialLoading}
                        className="rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Manage targets
                    </button>

                    <Button
                        type="button"
                        onClick={openAddLog}
                        disabled={initialLoading}
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

            {initialLoading ? (
                loadError || (!sessionPending && !session?.user.id) ? (
                    <LoadError
                        message="Unable to load your health data. Check your connection and try again."
                        onRetry={() => {
                            if (session?.user.id) {
                                void initializeForUser(session.user.id);
                            } else {
                                window.location.reload();
                            }
                        }}
                    />
                ) : (
                    <HealthOverviewSkeleton />
                )
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
                        selectedDate={activeProgressDate}
                        todayDate={today}
                        onSelectedDateChange={(date) =>
                            setSelectedProgressDate(date)
                        }
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
                isLoading={isDeleting}
            />
        </div>
    );
}
