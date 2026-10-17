import "dotenv/config";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { prisma } from "./prisma";

const secret = process.env.BETTER_AUTH_SECRET;

if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is not configured.");
}

export const auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    secret,

    database: prismaAdapter(prisma, {
        provider: "mysql",
    }),

    emailAndPassword: {
        enabled: true,
    },
});