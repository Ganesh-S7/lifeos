import type { PrismaClient } from "@/generated/prisma/client";
import type { BankAccountRequest } from "../schemas/finance-request-schema";
import { toBankAccountDto } from "./finance-dto";
import { writeFinancialPosition } from "./finance-position";

export class AccountNotFoundError extends Error {
    constructor() {
        super("Bank account not found.");
    }
}

export class AccountInUseError extends Error {
    constructor() {
        super("This account has transactions. Delete or move those transactions first.");
    }
}

type AccountMutation =
    | { kind: "create"; input: BankAccountRequest }
    | { kind: "update"; id: string; input: BankAccountRequest }
    | { kind: "delete"; id: string };

export async function mutateAccount(
    client: Pick<PrismaClient, "$transaction">,
    userId: string,
    mutation: AccountMutation,
) {
    if (!userId.trim()) throw new Error("An authenticated user is required.");

    return client.$transaction(async (transaction) => {
        if (mutation.kind === "delete") {
            const account = await transaction.bankAccount.findFirst({
                where: { id: mutation.id, userId },
            });
            if (!account) throw new AccountNotFoundError();

            const reference = await transaction.financeTransaction.findFirst({
                // Ownership is checked above. Any reference blocks deletion, even an
                // inconsistent cross-owner reference; no transaction details are exposed.
                where: {
                    OR: [
                        { accountId: account.id },
                        { destinationAccountId: account.id },
                    ],
                },
                select: { id: true },
            });
            if (reference) throw new AccountInUseError();

            try {
                const result = await transaction.bankAccount.deleteMany({
                    where: { id: account.id, userId },
                });
                if (result.count === 0) throw new AccountNotFoundError();
            } catch (error) {
                if (typeof error === "object" && error !== null &&
                    "code" in error && error.code === "P2003") {
                    throw new AccountInUseError();
                }
                throw error;
            }

            await writeFinancialPosition(transaction, userId);
            return { success: true as const };
        }

        const fields = {
            name: mutation.input.name,
            balanceSnapshot: mutation.input.balance.toString(),
            // A submitted current balance includes older ledger effects.
            // Keep the existing strict recordedAt > snapshotAt cutoff in the writer.
            balanceSnapshotAt: new Date(),
        };

        let account;
        if (mutation.kind === "create") {
            account = await transaction.bankAccount.create({ data: { ...fields, userId } });
        } else {
            const result = await transaction.bankAccount.updateMany({
                where: { id: mutation.id, userId },
                data: fields,
            });
            if (result.count === 0) throw new AccountNotFoundError();
            account = await transaction.bankAccount.findFirst({
                where: { id: mutation.id, userId },
            });
            if (!account) throw new AccountNotFoundError();
        }

        const dto = toBankAccountDto(account);
        await writeFinancialPosition(transaction, userId);
        return { account: dto };
    }, {
        isolationLevel: "Serializable",
    });
}
