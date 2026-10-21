import type { PrismaClient } from "@/generated/prisma/client";

import type { FinanceDataResponse } from "../types/finance-api";
import { toFinanceDataResponse } from "./finance-dto";

type FinanceReadClient = Pick<PrismaClient, "$transaction">;

export async function readFinanceForUser(
    client: FinanceReadClient,
    userId: string,
): Promise<FinanceDataResponse> {
    if (!userId.trim()) {
        throw new Error("An authenticated user is required to read Finance data.");
    }

    const records = await client.$transaction(async (transaction) => {
        const accounts = await transaction.bankAccount.findMany({
            where: { userId },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        const investments = await transaction.investment.findMany({
            where: { userId },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        const liabilities = await transaction.liability.findMany({
            where: { userId },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        const transactions = await transaction.financeTransaction.findMany({
            where: { userId },
            orderBy: [{ date: "desc" }, { recordedAt: "desc" }, { id: "asc" }],
        });
        const positionHistory = await transaction.financialPositionSnapshot.findMany({
            where: { userId },
            orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
        });

        return { accounts, investments, liabilities, transactions, positionHistory };
    }, {
        // All five reads use the same MySQL transaction snapshot.
        isolationLevel: "RepeatableRead",
    });

    return toFinanceDataResponse(records);
}
