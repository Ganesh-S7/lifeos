import type { financeApi } from "../api/finance-api";
import type { FinanceDataResponse } from "../types/finance-api";
import type { FinanceTransaction } from "../types/finance";
import {
    bankAccountRequestSchema,
    investmentRequestSchema,
    liabilityRequestSchema,
    financeTransactionRequestSchema,
    financeRecordParamsSchema,
} from "../schemas/finance-request-schema";

export const emptyFinanceData = (): FinanceDataResponse => ({
    accounts: [],
    investments: [],
    liabilities: [],
    transactions: [],
    positionHistory: [],
});

export interface FinanceState {
    userId: string | null;
    data: FinanceDataResponse;
    ready: boolean;
    loadError: string;
    refreshError: string;
    refreshing: boolean;
}

export const initialFinanceState: FinanceState = {
    userId: null,
    data: emptyFinanceData(),
    ready: false,
    loadError: "",
    refreshError: "",
    refreshing: false,
};

type TransactionInput = Omit<FinanceTransaction, "id" | "recordedAt"> & { id?: string };

/** Session-scoped external store. The API owns IDs, timestamps, ledger validation and history. */
export function createFinanceStore(api: typeof financeApi) {
    let state = initialFinanceState;
    let generation = 0;
    let queue: Promise<unknown> = Promise.resolve();
    let loading: Promise<void> | undefined;
    const listeners = new Set<() => void>();

    function publish(next: FinanceState) {
        state = next;
        listeners.forEach((listener) => listener());
    }

    function assertSession(version: number) {
        if (version !== generation || !state.userId) {
            throw new Error("Your Finance session changed. Please reopen the form.");
        }
    }

    // Serialize writes and reads so an earlier refresh cannot overwrite a later write.
    function enqueue<T>(operation: (version: number) => Promise<T>): Promise<T> {
        const version = generation;
        const result = queue.then(() => {
            assertSession(version);
            return operation(version);
        });
        queue = result.catch(() => undefined);
        return result;
    }

    async function read(version: number) {
        publish({ ...state, refreshing: true, loadError: "", refreshError: "" });
        try {
            const data = await api.getFinanceData();
            assertSession(version);
            publish({ ...state, data, ready: true, refreshing: false });
        } catch (cause) {
            if (version !== generation) return;
            const message = cause instanceof Error ? cause.message : "Unable to load your finance data.";
            publish({
                ...state,
                refreshing: false,
                loadError: state.ready ? "" : message,
                refreshError: state.ready
                    ? `Your saved changes are retained. Finance could not refresh: ${message}`
                    : "",
            });
        }
    }

    function retry(): Promise<void> {
        if (!state.userId) return Promise.resolve();
        if (loading) return loading;
        // A session change may cancel a queued read before it starts.
        const request = enqueue(read).catch(() => undefined);
        loading = request;
        void request.finally(() => {
            if (loading === request) loading = undefined;
        }).catch(() => undefined);
        return request;
    }

    function setSession(userId: string | null): Promise<void> {
        if (state.userId !== userId) {
            generation += 1;
            queue = Promise.resolve();
            loading = undefined;
            publish({ ...initialFinanceState, data: emptyFinanceData(), userId });
        }
        // A failed initial read stays failed until an explicit retry.
        if (!userId || state.ready || state.loadError) return Promise.resolve();
        return retry();
    }

    async function mutate<T>(
        write: () => Promise<T>,
        apply: (data: FinanceDataResponse, result: T) => FinanceDataResponse,
    ): Promise<void> {
        if (!state.ready || !state.userId) {
            throw new Error("Finance data is not ready. Please try again.");
        }
        return enqueue(async (version) => {
            const result = await write();
            assertSession(version);
            publish({ ...state, data: apply(state.data, result) });
            // read handles its own failure: a committed write must still resolve successfully.
            await read(version);
            assertSession(version);
        });
    }

    type Collection = "accounts" | "investments" | "liabilities" | "transactions";
    function save<K extends Collection>(
        key: K,
        write: () => Promise<FinanceDataResponse[K][number]>,
    ) {
        return mutate(write, (data, record) => ({
            ...data,
            [key]: [...data[key].filter((item) => item.id !== record.id), record],
        }));
    }

    function remove(key: Collection, id: string, write: (id: string) => Promise<void>) {
        const parsed = financeRecordParamsSchema.parse({ id });
        return mutate(() => write(parsed.id), (data) => ({
            ...data,
            [key]: data[key].filter((item) => item.id !== parsed.id),
        }));
    }

    const actions = {
        async saveAccount(input: { id?: string; name: string; balance: number }) {
            const { id, ...fields } = input;
            const body = bankAccountRequestSchema.parse(fields);
            return save("accounts", () => id
                ? api.updateAccount(id, body)
                : api.createAccount(body));
        },
        async deleteAccount(id: string) {
            return remove("accounts", id, api.deleteAccount);
        },
        async saveInvestment(input: { id?: string; name: string; type: string; value: number }) {
            const { id, ...fields } = input;
            const body = investmentRequestSchema.parse(fields);
            return save("investments", () => id
                ? api.updateInvestment(id, body)
                : api.createInvestment(body));
        },
        async deleteInvestment(id: string) {
            return remove("investments", id, api.deleteInvestment);
        },
        async saveLiability(input: {
            id?: string;
            name: string;
            type: string;
            balance: number;
            monthlyPayment?: number;
        }) {
            const { id, ...fields } = input;
            const body = liabilityRequestSchema.parse(fields);
            return save("liabilities", () => id
                ? api.updateLiability(id, body)
                : api.createLiability(body));
        },
        async deleteLiability(id: string) {
            return remove("liabilities", id, api.deleteLiability);
        },
        async saveTransaction(input: TransactionInput) {
            const fields = {
                type: input.type,
                amount: input.amount,
                description: input.description,
                date: input.date,
                accountId: input.accountId,
                note: input.note,
            };
            // Forms may carry hidden optional fields. Send only the active variant's fields.
            const body = financeTransactionRequestSchema.parse({
                ...fields,
                ...(input.type === "income" || input.type === "expense"
                    ? { category: input.category } : {}),
                ...(input.type === "transfer"
                    ? { destinationAccountId: input.destinationAccountId } : {}),
                ...(input.type === "investment_purchase" || input.type === "investment_sale"
                    ? { investmentId: input.investmentId } : {}),
            });
            return save("transactions", () => input.id
                ? api.updateTransaction(input.id, body)
                : api.createTransaction(body));
        },
        async deleteTransaction(id: string) {
            return remove("transactions", id, api.deleteTransaction);
        },
    };

    return {
        getSnapshot: () => state,
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        setSession,
        retry,
        actions,
    };
}
