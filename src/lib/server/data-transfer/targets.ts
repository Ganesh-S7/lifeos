import { databaseAdapterOptions } from "../database-config";
import { isIP } from "node:net";
import { canonical, fingerprint, normalizeEmail, requireTransfer, type Policy, type TransferPackage } from "./contracts";

export type DestinationEnvironment = "production" | "local-test";
const loopback = (host: string) => /^(?:(?:[\w-]+\.)*localhost\.?|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0|\[::\])$/i.test(host);

/** No dotenv loading, file fallback, normalization, or secret persistence. */
export function injectedProductionEnvironment(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const result: NodeJS.ProcessEnv = { NODE_ENV: "production" };
    for (const key of ["DATABASE_URL", "DATABASE_SSL_MODE", "DATABASE_SSL_CA"] as const) {
        const value = input[key];
        requireTransfer(typeof value === "string" && value.trim().length > 0, "MISSING_PRODUCTION_ENVIRONMENT");
        requireTransfer(!/^(?:\[(?:SENSITIVE|REDACTED|ENCRYPTED)\]|\*+|<[^>]+>|(?:CHANGE|REPLACE)[_-]?ME)$/i.test(value.trim()), "PLACEHOLDER_PRODUCTION_ENVIRONMENT");
        result[key] = value;
    }
    requireTransfer(input.VERCEL_ENV === undefined || input.VERCEL_ENV === "production", "WRONG_INJECTED_ENVIRONMENT");
    requireTransfer(result.DATABASE_SSL_MODE === "verify", "PRODUCTION_TLS_REQUIRED");
    return result;
}

export function confirmImport(pkg: TransferPackage, input: {
    sourceOwnerId: string; destinationOwnerId: string; ownerEmail: string;
    environment: DestinationEnvironment; apply: boolean;
    confirmOwner?: string; confirmSHA256?: string; confirmProductionWrite?: boolean;
}) {
    requireTransfer(input.sourceOwnerId === pkg.manifest.source.ownerId, "SOURCE_OWNER_CONFIRMATION_REQUIRED");
    requireTransfer(input.destinationOwnerId.trim().length > 0 && input.destinationOwnerId.length <= 191 &&
        normalizeEmail(input.ownerEmail) === pkg.manifest.source.email, "OWNER_MAPPING_REJECTED");
    if (input.apply) {
        requireTransfer(input.confirmOwner === input.destinationOwnerId && input.confirmSHA256 === pkg.sha256, "WRITE_CONFIRMATION_REQUIRED");
        requireTransfer(input.environment !== "production" || input.confirmProductionWrite === true, "PRODUCTION_WRITE_CONFIRMATION_REQUIRED");
    }
}

export function verifyTarget(env: NodeJS.ProcessEnv, policy: Policy, role: "source" | "destination", environment: "local" | DestinationEnvironment) {
    let url: URL;
    try {
        url = new URL(env.DATABASE_URL ?? "");
    } catch {
        throw new Error("INVALID_DATABASE_CONFIGURATION");
    }
    requireTransfer(url.protocol === "mysql:" && !url.search && !url.hash, "INVALID_DATABASE_CONFIGURATION");
    const endpoint = {
        host: url.hostname.toLowerCase(), port: Number(url.port || 3306),
        database: decodeURIComponent(url.pathname.slice(1)),
    };
    if (role === "source") {
        requireTransfer(environment === "local" && env.NODE_ENV !== "production" && loopback(endpoint.host) &&
            canonical(endpoint) === canonical(policy.source), "SOURCE_TARGET_REJECTED");
    } else {
        requireTransfer(environment !== "local", "DESTINATION_ENVIRONMENT_REQUIRED");
        requireTransfer(policy.destinations[environment].some((allowed) => canonical(allowed) === canonical(endpoint)), "DESTINATION_NOT_ALLOWLISTED");
        if (environment === "production") {
            requireTransfer(!loopback(endpoint.host) &&
                isIP(endpoint.host.replace(/^\[|\]$/g, "")) === 0 &&
                env.DATABASE_SSL_MODE === "verify" && Boolean(env.DATABASE_SSL_CA), "PRODUCTION_TLS_REQUIRED");
        } else {
            requireTransfer(env.NODE_ENV !== "production" && loopback(endpoint.host) &&
                /^lifeos_transfer_test(?:_[a-z0-9]+)?$/.test(endpoint.database), "ISOLATED_TEST_DATABASE_REQUIRED");
        }
        requireTransfer(fingerprint(endpoint) !== fingerprint(policy.source), "SOURCE_EQUALS_DESTINATION");
    }
    // Reuse all application TLS safeguards, CA validation and adapter pool policy.
    const options = databaseAdapterOptions({ ...env, NODE_ENV: environment === "production" ? "production" : env.NODE_ENV });
    return { endpoint, options };
}
