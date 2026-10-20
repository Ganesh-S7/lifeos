import { createHash, timingSafeEqual } from "node:crypto";

/** Compare fixed-length digests without exposing tokens or token-length errors. */
export function isAuthorizedCronRequest(request: Request, secret: string | undefined): boolean {
    if (!secret?.trim()) {
        return false;
    }
    const supplied = request.headers.get("authorization") ?? "";
    const expected = `Bearer ${secret}`;
    return timingSafeEqual(
        createHash("sha256").update(supplied).digest(),
        createHash("sha256").update(expected).digest(),
    );
}
