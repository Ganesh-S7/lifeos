import { X509Certificate } from "node:crypto";
import * as tls from "node:tls";

interface DatabaseEnvironment {
    NODE_ENV?: string;
    DATABASE_URL?: string;
    DATABASE_SSL_MODE?: string;
    DATABASE_SSL_CA?: string;
}

type VerifiedTlsOptions = {
    rejectUnauthorized: true;
    ca: string | string[];
};

function normalizeCertificateBundle(value: string): string {
    const pem = value
        .replace(/\\r\\n/g, "\n")
        .replace(/\\n/g, "\n")
        .replace(/\r\n?/g, "\n")
        .trim();
    const pattern = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
    const certificates = pem.match(pattern);

    try {
        if (!certificates?.length || pem.replace(pattern, "").trim()) {
            throw new Error();
        }
        for (const certificate of certificates) {
            new X509Certificate(certificate);
        }
    } catch {
        // Never include the input, OpenSSL diagnostic or certificate contents.
        throw new Error("DATABASE_SSL_CA must contain only valid PEM X.509 certificates.");
    }

    return `${certificates.join("\n")}\n`;
}

function databaseTlsOptions(env: DatabaseEnvironment): false | VerifiedTlsOptions {
    const mode = env.DATABASE_SSL_MODE;
    if (mode !== undefined && mode !== "disable" && mode !== "verify") {
        throw new Error("DATABASE_SSL_MODE must be exactly disable or verify.");
    }
    if (env.NODE_ENV === "production" && mode === "disable") {
        throw new Error("DATABASE_SSL_MODE=disable is not allowed in production.");
    }

    const enabled = env.NODE_ENV === "production" || mode === "verify";
    if (!enabled) {
        if (env.DATABASE_SSL_CA !== undefined) {
            throw new Error("DATABASE_SSL_CA requires DATABASE_SSL_MODE=verify outside production.");
        }
        return false;
    }

    if (env.DATABASE_SSL_CA !== undefined) {
        return {
            rejectUnauthorized: true,
            ca: normalizeCertificateBundle(env.DATABASE_SSL_CA),
        };
    }

    // Available since Node 22.15; our pinned Node 22.23.3 supports this API,
    // but the existing @types/node 20 declarations do not yet expose it.
    const nodeTls = tls as typeof tls & {
        getCACertificates(type: "default"): string[];
    };
    const ca = nodeTls.getCACertificates("default");
    if (!ca.length) {
        throw new Error("Node.js has no default CA certificates; configure DATABASE_SSL_CA.");
    }

    // An explicit CA set also prevents the connector's MariaDB fingerprint
    // fallback. Do not override its default checkServerIdentity or servername.
    return { rejectUnauthorized: true, ca };
}

/** Build adapter settings only; no pool creation or database connection occurs. */
export function databaseAdapterOptions(env: DatabaseEnvironment = process.env) {
    if (!env.DATABASE_URL) {
        throw new Error("DATABASE_URL is not configured.");
    }

    let url: URL;
    try {
        url = new URL(env.DATABASE_URL);
    } catch {
        throw new Error("DATABASE_URL must be a valid database URL.");
    }

    return {
        host: url.hostname,
        port: Number(url.port || 3306),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: decodeURIComponent(url.pathname.replace(/^\//, "")),
        connectionLimit: 5,
        ssl: databaseTlsOptions(env),
    };
}
