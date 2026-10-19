import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

/** P2034 was reproduced with the MySQL adapter's 1213 TransactionWriteConflict. */
export function financeConcurrencyError(error: unknown) {
    if (!(error instanceof PrismaClientKnownRequestError) || error.code !== "P2034") {
        return null;
    }
    return {
        error: "CONCURRENT_MODIFICATION",
        message: "Your financial data changed during this operation. Please refresh and try again.",
    };
}

function object(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null
        ? value as Record<string, unknown> : undefined;
}

/** Log classification details, never Prisma messages, SQL, parameters, or raw metadata. */
export function financeMutationDiagnostics(error: unknown) {
    const errorClass = error instanceof Error ? error.constructor.name : "UnknownError";
    if (!(error instanceof PrismaClientKnownRequestError)) return { errorClass };

    const adapter = object(error.meta?.driverAdapterError);
    const cause = object(adapter?.cause);
    const driverCode = typeof cause?.originalCode === "string" && /^\d{1,6}$/.test(cause.originalCode)
        ? cause.originalCode : undefined;
    return {
        errorClass,
        prismaCode: error.code,
        clientVersion: error.clientVersion,
        driverCode,
        driverKind: cause?.kind === "TransactionWriteConflict" ? cause.kind : undefined,
    };
}
