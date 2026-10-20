const rejection = {
    error: "UNTRUSTED_ORIGIN",
    message: "This request origin is not allowed.",
};

function parseHttpUrl(value: string): URL | null {
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
        return url.protocol === "http:" || url.protocol === "https:" ? url : null;
    } catch {
        return null;
    }
}

function parseOrigin(value: string): string | null {
    // An optional root slash is harmless; paths, queries and fragments are not
    // allowlist entries, even when URL normalization would erase them.
    if (!/^https?:\/\/[^/?#]+\/?$/i.test(value)) {
        return null;
    }
    return parseHttpUrl(value)?.origin ?? null;
}

function trustedOrigins(): Set<string> | null {
    const canonical = parseOrigin(process.env.BETTER_AUTH_URL ?? "");
    if (!canonical) {
        return null;
    }

    const origins = new Set([canonical]);
    const additional = process.env.BETTER_AUTH_TRUSTED_ORIGINS;
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

/** Server-only browser-session policy; never infer trust from request/proxy hosts. */
export function validateMutationOrigin(request: Request): Response | null {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        return null;
    }

    const origins = trustedOrigins();
    const site = request.headers.get("sec-fetch-site");
    const allowedSite = site === null || ["same-origin", "same-site", "none"].includes(site);
    const originHeader = request.headers.get("origin");
    const origin = originHeader !== null
        ? parseOrigin(originHeader)
        : parseHttpUrl(request.headers.get("referer") ?? "")?.origin ?? null;

    if (origins && allowedSite && origin && origins.has(origin)) {
        return null;
    }

    return Response.json(rejection, {
        status: 403,
        headers: { "Cache-Control": "private, no-store" },
    });
}
