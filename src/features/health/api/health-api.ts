import type {
    HealthLog,
    HealthTargets,
} from "@/features/health/types/health";

type HealthLogInput = {
    id?: string;
    date: string;
    weightKg?: number;
    steps?: number;
    sleepMinutes?: number;
    waterMl?: number;
    caloriesKcal?: number;
    proteinGrams?: number;
    carbsGrams?: number;
    fiberGrams?: number;
};

type HealthTargetsInput = Omit<HealthTargets, "updatedAt">;

type HealthDataResponse = {
    logs: HealthLog[];
    targets: HealthTargets | null;
};

type SaveHealthLogResponse = {
    log: HealthLog;
};

type SaveHealthTargetsResponse = {
    targets: HealthTargets | null;
};

type ApiErrorResponse = {
    error?: string;
    message?: string;
};

export class HealthApiError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly code?: string,
    ) {
        super(message);
        this.name = "HealthApiError";
    }
}

async function parseResponse<T>(
    response: Response,
): Promise<T> {
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
        const errorPayload = payload as ApiErrorResponse | null;

        throw new HealthApiError(
            errorPayload?.message ??
            "Something went wrong while accessing your health data.",
            response.status,
            errorPayload?.error,
        );
    }

    return payload as T;
}

/**
 * Fetch all Health data for the authenticated user.
 */
async function getHealthData(): Promise<HealthDataResponse> {
    const response = await fetch("/api/health", {
        method: "GET",
        cache: "no-store",
    });

    return parseResponse<HealthDataResponse>(response);
}

/**
 * Create or update a daily health log.
 */
async function saveHealthLog(
    input: HealthLogInput,
): Promise<HealthLog> {
    const response = await fetch("/api/health/logs", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
    });

    const result = await parseResponse<SaveHealthLogResponse>(
        response,
    );

    return result.log;
}

/**
 * Delete a health log belonging to the authenticated user.
 */
async function deleteHealthLog(id: string): Promise<void> {
    const response = await fetch(
        `/api/health/logs/${encodeURIComponent(id)}`,
        {
            method: "DELETE",
        },
    );

    await parseResponse<{ success: true }>(response);
}

/**
 * Create or replace the authenticated user's health targets.
 */
async function saveHealthTargets(
    targets: HealthTargetsInput,
): Promise<HealthTargets | null> {
    const response = await fetch("/api/health/targets", {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(targets),
    });

    const result = await parseResponse<SaveHealthTargetsResponse>(
        response,
    );

    return result.targets;
}

/**
 * Clear all health targets for the authenticated user.
 */
async function deleteHealthTargets(): Promise<void> {
    const response = await fetch("/api/health/targets", {
        method: "DELETE",
    });

    await parseResponse<{
        success: true;
        targets: null;
    }>(response);
}

export const healthApi = {
    getHealthData,
    saveHealthLog,
    deleteHealthLog,
    saveHealthTargets,
    deleteHealthTargets,
};