import type { PrismaClient } from "@/generated/prisma/client";
import type { FinanceTransactionRequest } from "../schemas/finance-request-schema";
import { financeDateToDatabase, toFinanceTransactionDto } from "./finance-dto";
import { validateFinanceLedger } from "./finance-ledger";
import { writeFinancialPosition } from "./finance-position";

export type SupportedTransactionRequest = Extract<
    FinanceTransactionRequest,
    { type: "income" | "expense" | "transfer" }
>;

export function isSupportedTransactionType(type: string): type is SupportedTransactionRequest["type"] {
    return type === "income" || type === "expense" || type === "transfer";
}

export class TransactionMutationError extends Error {
    readonly code: string;
    readonly status: 400 | 404;

    constructor(code: string, status: 400 | 404, message: string) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

type TransactionMutation =
    | { kind: "create"; input: SupportedTransactionRequest }
    | { kind: "update"; id: string; input: SupportedTransactionRequest }
    | { kind: "delete"; id: string };

function notFound() {
    return new TransactionMutationError("NOT_FOUND", 404, "Transaction not found.");
}

export async function mutateTransaction(
    client: Pick<PrismaClient, "$transaction">,
    userId: string,
    mutation: TransactionMutation,
) {
    if (!userId.trim()) throw new Error("An authenticated user is required.");

    return client.$transaction(async (transaction) => {
        const existing = mutation.kind === "create" ? null
            : await transaction.financeTransaction.findFirst({ where: { id: mutation.id, userId } });
        if (mutation.kind !== "create" && !existing) throw notFound();
        if ((existing && !isSupportedTransactionType(existing.type)) ||
            (mutation.kind !== "delete" && !isSupportedTransactionType(mutation.input.type))) {
            throw new TransactionMutationError("UNSUPPORTED_TRANSACTION_TYPE", 400,
                "Only income, expense, and transfer transactions can be managed here.");
        }
        if (existing && mutation.kind === "update" && existing.type !== mutation.input.type) {
            throw new TransactionMutationError("TRANSACTION_TYPE_CHANGE_NOT_SUPPORTED", 400,
                "Keep the original transaction type when editing transactions.");
        }

        if ((existing?.type === "transfer" &&
            (!existing.destinationAccountId || existing.accountId === existing.destinationAccountId)) ||
            (mutation.kind !== "delete" && mutation.input.type === "transfer" &&
                mutation.input.accountId === mutation.input.destinationAccountId)) {
            throw new TransactionMutationError("INVALID_ACCOUNT", 400,
                "Choose different source and destination bank accounts.");
        }
        const accountIds = new Set([
            ...(existing ? [existing.accountId] : []),
            ...(existing?.type === "transfer" && existing.destinationAccountId
                ? [existing.destinationAccountId] : []),
            ...(mutation.kind !== "delete" ? [mutation.input.accountId] : []),
            ...(mutation.kind !== "delete" && mutation.input.type === "transfer"
                ? [mutation.input.destinationAccountId] : []),
        ]);
        for (const id of accountIds) {
            const account = await transaction.bankAccount.findFirst({ where: { id, userId } });
            if (!account) {
                throw new TransactionMutationError("INVALID_ACCOUNT", 400,
                    "Select a registered bank account belonging to your account.");
            }
        }

        let saved;
        if (mutation.kind === "delete") {
            const result = await transaction.financeTransaction.deleteMany({
                where: { id: mutation.id, userId },
            });
            if (result.count === 0) throw notFound();
        } else {
            const fields = {
                type: mutation.input.type,
                amount: mutation.input.amount.toString(),
                description: mutation.input.description,
                date: financeDateToDatabase(mutation.input.date),
                accountId: mutation.input.accountId,
                category: mutation.input.type === "transfer" ? null : mutation.input.category ?? null,
                note: mutation.input.note ?? null,
                destinationAccountId: mutation.input.type === "transfer"
                    ? mutation.input.destinationAccountId : null,
                investmentId: null,
            };
            if (mutation.kind === "create") {
                // The database's server default assigns recordedAt and the ID.
                saved = await transaction.financeTransaction.create({ data: { ...fields, userId } });
            } else {
                // Omitting recordedAt preserves its original value even for date/account edits.
                const result = await transaction.financeTransaction.updateMany({
                    where: { id: mutation.id, userId },
                    data: fields,
                });
                if (result.count === 0) throw notFound();
                saved = await transaction.financeTransaction.findFirst({ where: { id: mutation.id, userId } });
                if (!saved) throw notFound();
            }
        }

        const accounts = await transaction.bankAccount.findMany({ where: { userId } });
        const investments = await transaction.investment.findMany({ where: { userId } });
        const transactions = await transaction.financeTransaction.findMany({ where: { userId } });
        validateFinanceLedger({ accounts, investments, transactions });
        const dto = saved ? toFinanceTransactionDto(saved) : null;
        await writeFinancialPosition(transaction, userId);
        return dto ? { transaction: dto } : { success: true as const };
    }, {
        isolationLevel: "Serializable",
    });
}
