import "dotenv/config";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { prisma } from "./prisma";
import { rateLimitSafeAdapter } from "./server/auth-rate-limit-adapter";
import { authOptions } from "./server/auth-config";

export const auth = betterAuth({
    ...authOptions(),

    database: rateLimitSafeAdapter(
        prismaAdapter(prisma, { provider: "mysql" }),
        prisma,
    ),
});
