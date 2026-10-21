import type { PrismaClient } from "@/generated/prisma/client";
import type { LiabilityRequest } from "../schemas/finance-request-schema";
import { toLiabilityDto } from "./finance-dto";
import { writeFinancialPosition } from "./finance-position";

export class LiabilityNotFoundError extends Error {
    constructor() {
        super("Liability not found.");
    }
}

type LiabilityMutation =
    | { kind: "create"; input: LiabilityRequest }
    | { kind: "update"; id: string; input: LiabilityRequest }
    | { kind: "delete"; id: string };

export async function mutateLiability(
    client: Pick<PrismaClient, "$transaction">,
    userId: string,
    mutation: LiabilityMutation,
) {
    if (!userId.trim()) throw new Error("An authenticated user is required.");

    return client.$transaction(async (transaction) => {
        if (mutation.kind === "delete") {
            const result = await transaction.liability.deleteMany({
                where: { id: mutation.id, userId },
            });
            if (result.count === 0) throw new LiabilityNotFoundError();
            await writeFinancialPosition(transaction, userId);
            return { success: true as const };
        }

        const fields = {
            name: mutation.input.name,
            type: mutation.input.type,
            balance: mutation.input.balance.toString(),
            // PUT replaces all editable fields: both null and omission clear the payment.
            monthlyPayment: mutation.input.monthlyPayment?.toString() ?? null,
        };

        let liability;
        if (mutation.kind === "create") {
            liability = await transaction.liability.create({ data: { ...fields, userId } });
        } else {
            const result = await transaction.liability.updateMany({
                where: { id: mutation.id, userId },
                data: fields,
            });
            if (result.count === 0) throw new LiabilityNotFoundError();
            liability = await transaction.liability.findFirst({
                where: { id: mutation.id, userId },
            });
            if (!liability) throw new LiabilityNotFoundError();
        }

        const dto = toLiabilityDto(liability);
        await writeFinancialPosition(transaction, userId);
        return { liability: dto };
    }, {
        // Read/write range locks serialize aggregate changes, including concurrent inserts.
        isolationLevel: "Serializable",
    });
}
