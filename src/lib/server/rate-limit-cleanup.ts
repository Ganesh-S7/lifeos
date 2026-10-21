import type { PrismaClient } from "../../generated/prisma/client";

export const RATE_LIMIT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const RATE_LIMIT_CLEANUP_BATCH_SIZE = 500;
export const RATE_LIMIT_CLEANUP_MAX_BATCHES = 10;

type CleanupClient = {
    rateLimit: Pick<PrismaClient["rateLimit"], "findMany" | "deleteMany">;
};

export interface RateLimitCleanupResult {
    deleted: number;
    batches: number;
    /** A full final batch means more stale rows may remain. */
    limitReached: boolean;
}

/**
 * lastRequest is Better Auth's last accepted request time in milliseconds.
 * Seven days exceeds every current auth window (the longest is 300 seconds).
 * Keep the cutoff fixed per invocation and recheck it in the DELETE itself.
 */
export async function cleanupRateLimits(
    client: CleanupClient,
    now = Date.now(),
): Promise<RateLimitCleanupResult> {
    if (!Number.isSafeInteger(now) || now < RATE_LIMIT_RETENTION_MS) {
        throw new Error("Invalid cleanup reference time.");
    }
    const cutoff = BigInt(now - RATE_LIMIT_RETENTION_MS);
    let deleted = 0;
    let batches = 0;

    while (batches < RATE_LIMIT_CLEANUP_MAX_BATCHES) {
        const candidates = await client.rateLimit.findMany({
            where: { lastRequest: { lt: cutoff } },
            orderBy: [{ lastRequest: "asc" }, { id: "asc" }],
            take: RATE_LIMIT_CLEANUP_BATCH_SIZE,
            select: { id: true },
        });
        if (candidates.length === 0) {
            return { deleted, batches, limitReached: false };
        }

        const result = await client.rateLimit.deleteMany({
            where: {
                id: { in: candidates.map((candidate) => candidate.id) },
                lastRequest: { lt: cutoff },
            },
        });
        deleted += result.count;
        batches++;
        if (candidates.length < RATE_LIMIT_CLEANUP_BATCH_SIZE) {
            return { deleted, batches, limitReached: false };
        }
    }

    return { deleted, batches, limitReached: true };
}
