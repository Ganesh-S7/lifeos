interface OriginEnvironment {
    BETTER_AUTH_URL?: string;
    BETTER_AUTH_TRUSTED_ORIGINS?: string;
}

export function parseHttpUrl(value: string): URL | null {
    // Reject syntax that the URL parser would otherwise repair or discard.
    if (/[\s\\]/.test(value)) {
        return null;
    }

    const authority = /^https?:\/\/([^/?#]+)/i.exec(value)?.[1];
    if (!authority || /[@*]/.test(authority)) {
        return null;
    }

    try {
        const url = new URL(value);
        if (url.hostname.includes("*") || url.hostname.includes("?")) {
            return null;
        }
        return url.protocol === "http:" || url.protocol === "https:" ? url : null;
    } catch {
        return null;
    }
}

export function parseOrigin(value: string): string | null {
    // An optional root slash is harmless; paths, queries and fragments are not
    // allowlist entries, even when URL normalization would erase them.
    if (!/^https?:\/\/[^/?#]+\/?$/i.test(value)) {
        return null;
    }
    return parseHttpUrl(value)?.origin ?? null;
}

export function configuredTrustedOrigins(
    env: OriginEnvironment = {
        BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
        BETTER_AUTH_TRUSTED_ORIGINS: process.env.BETTER_AUTH_TRUSTED_ORIGINS,
    },
): Set<string> | null {
    const canonical = parseOrigin(env.BETTER_AUTH_URL ?? "");
    if (!canonical) {
        return null;
    }

    const origins = new Set([canonical]);
    const additional = env.BETTER_AUTH_TRUSTED_ORIGINS;
    if (additional) {
        for (const entry of additional.split(",")) {
            const origin = parseOrigin(entry);
            if (!origin) {
                return null;
            }
            origins.add(origin);
        }
    }
    return origins;
}

