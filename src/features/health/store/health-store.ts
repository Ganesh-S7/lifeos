"use client";

import { useEffect } from "react";
import { create } from "zustand";

import { healthApi } from "../api/health-api";

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
    activeUserId: string | null;
    loadError: string | null;

    initializeForUser: (userId: string) => Promise<void>;
    resetForSignedOut: () => void;

    saveLog: (input: SaveHealthLogInput) => Promise<void>;
    deleteLog: (id: string) => Promise<void>;

    saveTargets: (
        targets: SaveHealthTargetsInput,
    ) => Promise<void>;

    clearTargets: () => Promise<void>;
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
] as const satisfies readonly (
    keyof Omit<
        HealthLog,
        "id" | "date" | "createdAt" | "updatedAt"
    >
)[];

function hasMeasurements(input: SaveHealthLogInput): boolean {
    return measurementFields.some(
        (field) => input[field] !== undefined,
    );
}

function sortLogsByDate(logs: HealthLog[]): HealthLog[] {
    return [...logs].sort((a, b) =>
        b.date.localeCompare(a.date),
    );
}

function getErrorMessage(
    cause: unknown,
    fallback: string,
): string {
    return cause instanceof Error ? cause.message : fallback;
}

function requireActiveUser(
    state: Pick<HealthStore, "activeUserId" | "ready">,
): string {
    if (!state.activeUserId || !state.ready) {
        throw new Error(
            "Your health data is not ready. Please try again.",
        );
    }

    return state.activeUserId;
}

// Prevent duplicate initialization requests and stale responses
// from updating the store after an account change.
let initializationSequence = 0;

let activeInitialization: {
    userId: string;
    promise: Promise<void>;
} | null = null;

export const useHealthStore = create<HealthStore>(
    (set, get) => ({
        logs: [],
        targets: null,

        ready: false,
        activeUserId: null,
        loadError: null,

        initializeForUser: (userId) => {
            if (!userId.trim()) {
                return Promise.resolve();
            }

            const state = get();

            if (
                state.activeUserId === userId &&
                state.ready
            ) {
                return Promise.resolve();
            }

            if (activeInitialization?.userId === userId) {
                return activeInitialization.promise;
            }

            const sequence = ++initializationSequence;

            // Clear the previous account's data immediately.
            set({
                logs: [],
                targets: null,
                ready: false,
                activeUserId: userId,
                loadError: null,
            });

            const promise = (async () => {
                try {
                    const data = await healthApi.getHealthData();

                    // Ignore responses belonging to an old session.
                    if (
                        sequence !== initializationSequence ||
                        get().activeUserId !== userId
                    ) {
                        return;
                    }

                    set({
                        logs: sortLogsByDate(data.logs),
                        targets: data.targets,
                        ready: true,
                        loadError: null,
                    });
                } catch (cause) {
                    if (
                        sequence !== initializationSequence ||
                        get().activeUserId !== userId
                    ) {
                        return;
                    }

                    set({
                        logs: [],
                        targets: null,
                        ready: false,
                        loadError: getErrorMessage(
                            cause,
                            "Unable to load your health data.",
                        ),
                    });
                }
            })();

            activeInitialization = {
                userId,
                promise,
            };

            void promise.finally(() => {
                if (activeInitialization?.promise === promise) {
                    activeInitialization = null;
                }
            });

            return promise;
        },

        resetForSignedOut: () => {
            // Invalidate outstanding database requests.
            initializationSequence += 1;
            activeInitialization = null;

            set({
                logs: [],
                targets: null,
                ready: false,
                activeUserId: null,
                loadError: null,
            });
        },

        saveLog: async (input) => {
            if (!hasMeasurements(input)) {
                throw new Error(
                    "Enter at least one health measurement.",
                );
            }

            const state = get();
            const userId = requireActiveUser(state);

            const existingById = input.id
                ? state.logs.find(
                    (log) => log.id === input.id,
                )
                : undefined;

            const existingByDate = state.logs.find(
                (log) => log.date === input.date,
            );

            if (
                existingById &&
                existingByDate &&
                existingById.id !== existingByDate.id
            ) {
                throw new Error(
                    "A health log already exists for this date. Edit that entry instead.",
                );
            }

            // Save to MySQL first.
            const savedLog = await healthApi.saveHealthLog(input);

            // Don't update the store if the account changed meanwhile.
            if (get().activeUserId !== userId) {
                return;
            }

            set((currentState) => ({
                logs: sortLogsByDate([
                    ...currentState.logs.filter(
                        (log) =>
                            log.id !== savedLog.id &&
                            log.date !== savedLog.date,
                    ),
                    savedLog,
                ]),
            }));
        },

        deleteLog: async (id) => {
            const userId = requireActiveUser(get());

            // Delete from MySQL first.
            await healthApi.deleteHealthLog(id);

            if (get().activeUserId !== userId) {
                return;
            }

            set((state) => ({
                logs: state.logs.filter(
                    (log) => log.id !== id,
                ),
            }));
        },

        saveTargets: async (targets) => {
            const userId = requireActiveUser(get());

            const savedTargets =
                await healthApi.saveHealthTargets(targets);

            if (get().activeUserId !== userId) {
                return;
            }

            set({
                targets: savedTargets,
            });
        },

        clearTargets: async () => {
            const userId = requireActiveUser(get());

            await healthApi.deleteHealthTargets();

            if (get().activeUserId !== userId) {
                return;
            }

            set({
                targets: null,
            });
        },
    }),
);

/**
 * Initialize Health from MySQL for the authenticated user.
 * No localStorage persistence or migration is involved.
 */
export function useHealthHydration(
    userId: string | undefined,
    sessionPending: boolean,
): void {
    const initializeForUser = useHealthStore(
        (state) => state.initializeForUser,
    );

    const resetForSignedOut = useHealthStore(
        (state) => state.resetForSignedOut,
    );

    useEffect(() => {
        if (sessionPending) {
            return;
        }

        if (!userId) {
            resetForSignedOut();
            return;
        }

        void initializeForUser(userId);
    }, [
        userId,
        sessionPending,
        initializeForUser,
        resetForSignedOut,
    ]);
}