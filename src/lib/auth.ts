import "dotenv/config";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { prisma } from "./prisma";
import { authOptions } from "./server/auth-config";

export const auth = betterAuth({
    ...authOptions(),

    database: prismaAdapter(prisma, {
        provider: "mysql",
    }),
});
