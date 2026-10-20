import {
    PrismaClientInitializationError,
    PrismaClientKnownRequestError,
    PrismaClientValidationError,
} from "@prisma/client/runtime/client";

// Reviewed diagnostic labels only. Unrecognized codes are deliberately omitted.
const safePrismaCodes = new Set([
    "P1000",
    "P1001",
    "P1002",
    "P1011",
    "P1017",
    "P2002",
    "P2003",
    "P2010",
    "P2024",
    "P2025",
    "P2028",
    "P2034",
]);

function prismaDiagnostics(errorClass: string, code: string | undefined) {
    return code && safePrismaCodes.has(code)
        ? { errorClass, prismaCode: code }
        : { errorClass };
}

/**
 * Server-only diagnostic projection for sensitive API handlers.
 * Never inspect messages, stacks, causes, metadata, or arbitrary class names.
 */
export function errorDiagnostics(error: unknown) {
    if (error instanceof PrismaClientKnownRequestError) {
        return prismaDiagnostics("PrismaClientKnownRequestError", error.code);
    }

    if (error instanceof PrismaClientInitializationError) {
        return prismaDiagnostics("PrismaClientInitializationError", error.errorCode);
    }

    if (error instanceof PrismaClientValidationError) {
        return { errorClass: "PrismaClientValidationError" };
    }

    return { errorClass: error instanceof Error ? "Error" : "UnknownError" };
}
