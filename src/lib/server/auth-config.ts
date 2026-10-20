import type { BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { PHASE_PRODUCTION_BUILD } from "next/constants.js";

import { configuredTrustedOrigins } from "./trusted-origins";

interface AuthEnvironment {
    NODE_ENV?: string;
    BETTER_AUTH_URL?: string;
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_TRUSTED_ORIGINS?: string;
    LIFEOS_NEXT_PHASE?: string;
}

function isLoopbackOrigin(origin: string): boolean {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname);
}

function assertProductionOrigins(origins: Set<string>, production: boolean, build = false) {
    for (const origin of origins) {
        if (production && !origin.startsWith("https://") && !(build && isLoopbackOrigin(origin))) {
            throw new Error("Production authentication origins must use HTTPS.");
        }
    }
}

/** Server-only configuration; no request headers or database access establish trust. */
export function authOptions(env: AuthEnvironment = process.env) {
    const origins = configuredTrustedOrigins(env);
    if (!origins) {
        throw new Error("BETTER_AUTH_URL and trusted origins must be valid exact HTTP(S) origins.");
    }

    const production = env.NODE_ENV === "production";
    const build = env.LIFEOS_NEXT_PHASE === PHASE_PRODUCTION_BUILD;
    assertProductionOrigins(origins, production, build);

    const secret = env.BETTER_AUTH_SECRET;
    if (!secret) {
        throw new Error("BETTER_AUTH_SECRET is not configured.");
    }
    if (production && secret.length < 32) {
        throw new Error("Production BETTER_AUTH_SECRET must contain at least 32 characters.");
    }

    const baseURL = [...origins][0];
    const secure = production || baseURL.startsWith("https://");

    return {
        baseURL,
        secret,
        trustedOrigins: [...origins],
        hooks: {
            before: createAuthMiddleware(async () => {
                // Build imports may use loopback HTTP, actual auth operations may
                // not. Even an accidentally deployed phase marker cannot bypass it.
                try {
                    assertProductionOrigins(origins, production);
                } catch {
                    throw new APIError("INTERNAL_SERVER_ERROR", {
                        message: "Authentication configuration is invalid.",
                    });
                }
            }),
        },
        emailAndPassword: {
            enabled: true,
            disableSignUp: false,
            minPasswordLength: 8,
            maxPasswordLength: 128,
            requireEmailVerification: false,
        },
        advanced: {
            useSecureCookies: secure,
            defaultCookieAttributes: {
                secure,
                httpOnly: true,
                sameSite: "lax",
            },
            crossSubDomainCookies: { enabled: false },
            trustedProxyHeaders: false,
            disableCSRFCheck: false,
            disableOriginCheck: false,
        },
        rateLimit: {
            enabled: production,
            storage: "memory",
            window: 60,
            max: 100,
            customRules: {
                "/sign-up/email": { window: 300, max: 3 },
                "/sign-in/email": { window: 60, max: 3 },
                "/request-password-reset": { window: 300, max: 3 },
                "/reset-password": { window: 300, max: 3 },
                "/send-verification-email": { window: 300, max: 3 },
                "/verify-email": { window: 60, max: 10 },
            },
        },
    } satisfies BetterAuthOptions;
}
