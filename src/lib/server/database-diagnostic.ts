export type DatabaseDiagnosticCategory =
    | "TLS_VERIFICATION"
    | "NETWORK_OR_DNS"
    | "DATABASE_AUTHENTICATION"
    | "CONNECTION_POOL"
    | "DATABASE_CONFIGURATION"
    | "UNKNOWN_DATABASE_ERROR";

const codeCategories: Readonly<Record<string, DatabaseDiagnosticCategory>> = {
    P1000: "DATABASE_AUTHENTICATION",
    P1001: "NETWORK_OR_DNS",
    P1002: "NETWORK_OR_DNS",
    P1011: "TLS_VERIFICATION",
    P2024: "CONNECTION_POOL",
    P2039: "CONNECTION_POOL",
    "1044": "DATABASE_AUTHENTICATION",
    "1045": "DATABASE_AUTHENTICATION",
    "1049": "DATABASE_CONFIGURATION",
    "1040": "CONNECTION_POOL",
    "1203": "CONNECTION_POOL",
    "45028": "CONNECTION_POOL",
    ER_ACCESS_DENIED_ERROR: "DATABASE_AUTHENTICATION",
    ER_BAD_DB_ERROR: "DATABASE_CONFIGURATION",
    ER_GET_CONNECTION_TIMEOUT: "CONNECTION_POOL",
    ENOTFOUND: "NETWORK_OR_DNS",
    EAI_AGAIN: "NETWORK_OR_DNS",
    ECONNREFUSED: "NETWORK_OR_DNS",
    ECONNRESET: "NETWORK_OR_DNS",
    ETIMEDOUT: "NETWORK_OR_DNS",
    ERR_TLS_CERT_ALTNAME_INVALID: "TLS_VERIFICATION",
    CERT_HAS_EXPIRED: "TLS_VERIFICATION",
    DEPTH_ZERO_SELF_SIGNED_CERT: "TLS_VERIFICATION",
    SELF_SIGNED_CERT_IN_CHAIN: "TLS_VERIFICATION",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: "TLS_VERIFICATION",
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "TLS_VERIFICATION",
};

const kindCategories: Readonly<Record<string, DatabaseDiagnosticCategory>> = {
    AuthenticationFailed: "DATABASE_AUTHENTICATION",
    DatabaseAccessDenied: "DATABASE_AUTHENTICATION",
    DatabaseDoesNotExist: "DATABASE_CONFIGURATION",
    TooManyConnections: "CONNECTION_POOL",
};

// Inspect only data properties. Never evaluate getters, messages, stacks or SQL.
function field(value: object, key: string): unknown {
    return Object.getOwnPropertyDescriptor(value, key)?.value;
}

/** Project fixed labels only; never return/log the inspected error or metadata. */
export function databaseDiagnosticCategory(
    error: unknown,
    fallback: DatabaseDiagnosticCategory = "UNKNOWN_DATABASE_ERROR",
): DatabaseDiagnosticCategory {
    const pending: unknown[] = [error];
    const seen = new Set<object>();
    let poolFailure = false;

    // Prisma uses meta.driverAdapterError.cause; native errors can use cause.
    // Bound traversal and guard cycles without reading free-form cause strings.
    while (pending.length && seen.size < 16) {
        const current = pending.shift();
        if (!current || typeof current !== "object" || seen.has(current)) {
            continue;
        }
        seen.add(current);
        for (const key of ["code", "errorCode", "originalCode", "errno", "kind"]) {
            const value = field(current, key);
            if (typeof value !== "string" && typeof value !== "number") {
                continue;
            }
            const labels = key === "kind" ? kindCategories : codeCategories;
            const label = Object.hasOwn(labels, String(value)) ? labels[String(value)] : undefined;
            if (label === "CONNECTION_POOL") {
                poolFailure = true;
            } else if (label) {
                return label;
            }
        }
        for (const key of ["cause", "meta", "driverAdapterError"]) {
            pending.push(field(current, key));
        }
    }
    return poolFailure ? "CONNECTION_POOL" : fallback;
}
