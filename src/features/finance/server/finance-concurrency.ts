import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { errorDiagnostics } from "../../../lib/server/error-diagnostics";

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

/** Log classification details, never Prisma messages, SQL, parameters, or raw metadata. */
export function financeMutationDiagnostics(error: unknown) {
    return errorDiagnostics(error);
}
