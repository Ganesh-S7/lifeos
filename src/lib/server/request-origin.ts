import { configuredTrustedOrigins, parseHttpUrl, parseOrigin } from "./trusted-origins";

const rejection = {
    error: "UNTRUSTED_ORIGIN",
    message: "This request origin is not allowed.",
};

/** Server-only browser-session policy; never infer trust from request/proxy hosts. */
export function validateMutationOrigin(request: Request): Response | null {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        return null;
    }

    const origins = configuredTrustedOrigins();
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
