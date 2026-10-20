import type { BetterAuthOptions, DBAdapter } from "better-auth";

import type { Prisma, PrismaClient } from "../../generated/prisma/client";

/**
 * Keep Better Auth's native database limiter, but use affected-row counts for
 * its compare-and-increment. With Prisma 7.10.1/MySQL, update() can return the
 * transaction's previously read row after a competing update wins the guard.
 * updateMany() reports whether this request actually consumed a slot.
 */
export function rateLimitSafeAdapter(
    factory: (options: BetterAuthOptions) => DBAdapter<BetterAuthOptions>,
    client: Pick<PrismaClient, "rateLimit">,
) {
    return (options: BetterAuthOptions): DBAdapter<BetterAuthOptions> => {
        const adapter = factory(options);
        return {
            ...adapter,
            async incrementOne<T>(request: Parameters<typeof adapter.incrementOne>[0]) {
                if (request.model !== "rateLimit") {
                    return adapter.incrementOne<T>(request);
                }

                const filters: Prisma.RateLimitWhereInput[] = request.where.map((condition) => {
                    if (condition.connector && condition.connector !== "AND") {
                        throw new Error("Unsupported rate-limit counter predicate.");
                    }
                    const operator = condition.operator ?? "eq";
                    if (condition.field === "key" && operator === "eq" &&
                        typeof condition.value === "string") {
                        return { key: condition.value };
                    }
                    if ((condition.field === "lastRequest" || condition.field === "count") &&
                        ["eq", "lt", "lte", "gt", "gte"].includes(operator) &&
                        typeof condition.value === "number" && Number.isSafeInteger(condition.value)) {
                        return {
                            [condition.field]: {
                                [operator === "eq" ? "equals" : operator]: condition.value,
                            },
                        };
                    }
                    throw new Error("Unsupported rate-limit counter predicate.");
                });
                const key = request.where.find((condition) => condition.field === "key")?.value;
                const lastRequest = request.set?.lastRequest;
                const resetting = Object.keys(request.increment).length === 0 && request.set?.count === 1;
                const incrementing = Object.keys(request.increment).length === 1 && request.increment.count === 1;
                if (typeof key !== "string" || typeof lastRequest !== "number" ||
                    !Number.isSafeInteger(lastRequest) || (!resetting && !incrementing)) {
                    throw new Error("Unsupported rate-limit counter mutation.");
                }

                const result = await client.rateLimit.updateMany({
                    where: { AND: filters },
                    data: {
                        count: resetting ? 1 : { increment: 1 },
                        lastRequest: BigInt(lastRequest),
                    },
                });
                if (result.count === 0) {
                    return null;
                }
                const row = await client.rateLimit.findUniqueOrThrow({ where: { key } });
                return { ...row, lastRequest: Number(row.lastRequest) } as T;
            },
        };
    };
}
