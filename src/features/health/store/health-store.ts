"use client";

import { useEffect } from "react";
import { create } from "zustand";
import {
    createJSONStorage,
    persist,
} from "zustand/middleware";

import type {
    HealthLog,
    HealthTargets,
} from "../types/health";

export type SaveHealthLogInput = Omit<
    HealthLog,
    "id" | "createdAt" | "updatedAt"
> & {
    id?: string;
};

export type SaveHealthTargetsInput = Omit<
    HealthTargets,
    "updatedAt"
>;

interface HealthStore {
    logs: HealthLog[];
    targets: HealthTargets | null;
    ready: boolean;

    setReady: (ready: boolean) => void;

    saveLog: (input: SaveHealthLogInput) => void;
    deleteLog: (id: string) => void;

    saveTargets: (targets: SaveHealthTargetsInput) => void;
    clearTargets: () => void;
}

const measurementFields = [
    "weightKg",
    "steps",
    "sleepMinutes",
    "waterMl",
    "caloriesKcal",
    "proteinGrams",
    "carbsGrams",
    "fiberGrams",
] as const satisfies readonly (keyof Omit<
    HealthLog,
    "id" | "date" | "createdAt" | "updatedAt"
>)[];

function createId(): string {
    return crypto.randomUUID();
}

function sortLogsByDate(logs: HealthLog[]): HealthLog[] {
    return [...logs].sort((a, b) =>
        b.date.localeCompare(a.date),
    );
}

function hasMeasurements(input: SaveHealthLogInput): boolean {
    return measurementFields.some(
        (field) => input[field] !== undefined,
    );
}

export const useHealthStore = create<HealthStore>()(
    persist(
        (set, get) => ({
            logs: [],
            targets: null,
            ready: false,

            setReady: (ready) => set({ ready }),

            saveLog: (input) => {
                if (!hasMeasurements(input)) {
                    throw new Error(
                        "Enter at least one health measurement.",
                    );
                }

                const state = get();

                const existingById = input.id
                    ? state.logs.find((log) => log.id === input.id)
                    : undefined;

                const existingByDate = state.logs.find(
                    (log) => log.date === input.date,
                );

                // Editing an existing entry must not overwrite another
                // daily record if the date is changed to an occupied date.
                if (
                    existingById &&
                    existingByDate &&
                    existingById.id !== existingByDate.id
                ) {
                    throw new Error(
                        "A health log already exists for this date. Edit that entry instead.",
                    );
                }

                // When creating a log for a date that already exists,
                // update that record rather than creating a duplicate.
                const existing = existingById ?? existingByDate;
                const now = new Date().toISOString();

                const savedLog: HealthLog = {
                    ...input,
                    id: existing?.id ?? createId(),
                    createdAt: existing?.createdAt ?? now,
                    updatedAt: now,
                };

                const logs = state.logs.filter(
                    (log) =>
                        log.id !== savedLog.id &&
                        log.date !== savedLog.date,
                );

                logs.push(savedLog);

                set({
                    logs: sortLogsByDate(logs),
                });
            },

            deleteLog: (id) => {
                set((state) => ({
                    logs: state.logs.filter(
                        (log) => log.id !== id,
                    ),
                }));
            },

            saveTargets: (targets) => {
                const hasTargets = Object.values(targets).some(
                    (value) => value !== undefined,
                );

                if (!hasTargets) {
                    set({ targets: null });
                    return;
                }

                set({
                    targets: {
                        ...targets,
                        updatedAt: new Date().toISOString(),
                    },
                });
            },

            clearTargets: () => {
                set({ targets: null });
            },
        }),
        {
            name: "lifeos-health-v1",
            storage: createJSONStorage(() => localStorage),

            // Prevent persisted browser data from being read before
            // the client explicitly starts hydration.
            skipHydration: true,

            // Do not persist transient hydration state or functions.
            partialize: (state) => ({
                logs: state.logs,
                targets: state.targets,
            }),

            onRehydrateStorage: () => (state) => {
                state?.setReady(true);
            },
        },
    ),
);

let hydrationStarted = false;

/**
 * Call this hook from the Health client entry point.
 *
 * The Health UI can use `ready` to avoid displaying empty
 * values before localStorage has been restored.
 */
export function useHealthHydration(): void {
    useEffect(() => {
        if (
            hydrationStarted ||
            useHealthStore.persist.hasHydrated()
        ) {
            return;
        }

        hydrationStarted = true;

        void Promise.resolve(
            useHealthStore.persist.rehydrate(),
        ).catch(() => {
            useHealthStore.getState().setReady(true);
            hydrationStarted = false;
        });
    }, []);
}