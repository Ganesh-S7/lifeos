// Isolated Node test processes use a synthetic application origin, never .env.
export const testOrigin = "http://localhost";
process.env.BETTER_AUTH_URL = testOrigin;
delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;

export function sameOriginHeaders(headers = {}) {
    return {
        Origin: testOrigin,
        "Sec-Fetch-Site": "same-origin",
        ...headers,
    };
}
