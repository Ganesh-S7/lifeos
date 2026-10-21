import type { PrismaClient } from "@/generated/prisma/client";
import type { InvestmentRequest } from "../schemas/finance-request-schema";
import { toInvestmentDto } from "./finance-dto";
import { writeFinancialPosition } from "./finance-position";

export class InvestmentNotFoundError extends Error {
    constructor() {
        super("Investment not found.");
    }
}

export class InvestmentInUseError extends Error {
    constructor() {
        super("This investment has transactions. Delete those transactions first.");
    }
}

type InvestmentMutation =
    | { kind: "create"; input: InvestmentRequest }
    | { kind: "update"; id: string; input: InvestmentRequest }
    | { kind: "delete"; id: string };

export async function mutateInvestment(
    client: Pick<PrismaClient, "$transaction">,
    userId: string,
    mutation: InvestmentMutation,
) {
    if (!userId.trim()) throw new Error("An authenticated user is required.");

    return client.$transaction(async (transaction) => {
        if (mutation.kind === "delete") {
            const investment = await transaction.investment.findFirst({
                where: { id: mutation.id, userId },
            });
            if (!investment) throw new InvestmentNotFoundError();

            const reference = await transaction.financeTransaction.findFirst({
                // Ownership is checked above. Any reference blocks deletion, even an
                // inconsistent cross-owner reference; no transaction details are exposed.
                where: { investmentId: investment.id },
                select: { id: true },
            });
            if (reference) throw new InvestmentInUseError();

            try {
                const result = await transaction.investment.deleteMany({
                    where: { id: investment.id, userId },
                });
                if (result.count === 0) throw new InvestmentNotFoundError();
            } catch (error) {
                if (typeof error === "object" && error !== null &&
                    "code" in error && error.code === "P2003") {
                    throw new InvestmentInUseError();
                }
                throw error;
            }

            await writeFinancialPosition(transaction, userId);
            return { success: true as const };
        }

        const fields = {
            name: mutation.input.name,
            type: mutation.input.type,
            valuationSnapshot: mutation.input.value.toString(),
            // A submitted current valuation includes older trade effects.
            // Keep the existing strict recordedAt > snapshotAt cutoff in the writer.
            valuationSnapshotAt: new Date(),
        };

        let investment;
        if (mutation.kind === "create") {
            investment = await transaction.investment.create({ data: { ...fields, userId } });
        } else {
            const result = await transaction.investment.updateMany({
                where: { id: mutation.id, userId },
                data: fields,
            });
            if (result.count === 0) throw new InvestmentNotFoundError();
            investment = await transaction.investment.findFirst({
                where: { id: mutation.id, userId },
            });
            if (!investment) throw new InvestmentNotFoundError();
        }

        const dto = toInvestmentDto(investment);
        await writeFinancialPosition(transaction, userId);
        return { investment: dto };
    }, {
        isolationLevel: "Serializable",
    });
}
