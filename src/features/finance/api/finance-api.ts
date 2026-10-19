import type {
    BankAccountDto,
    BankAccountInput,
    FinanceDataResponse,
    FinanceTransactionDto,
    FinanceTransactionInput,
    InvestmentDto,
    InvestmentInput,
    LiabilityDto,
    LiabilityInput,
} from "../types/finance-api";

export class FinanceApiError extends Error {
    /** Zero means no HTTP response was received. */
    readonly status: number;
    readonly code?: string;

    constructor(message: string, status: number, code?: string) {
        super(message);
        this.name = "FinanceApiError";
        this.status = status;
        this.code = code;
    }
}

type JsonObject = Record<string, unknown>;
type ResourceKey = "account" | "investment" | "liability" | "transaction";

function isObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidResponse(status: number) {
    return new FinanceApiError(
        "The Finance service returned an invalid response. Please try again.",
        status,
        "INVALID_RESPONSE",
    );
}

async function request(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    fallback: string,
    input?: BankAccountInput | InvestmentInput | LiabilityInput | FinanceTransactionInput,
): Promise<{ payload: JsonObject; status: number }> {
    // Serialize before the network boundary; never silently omit a failed request body.
    let body: string | undefined;
    try {
        body = input === undefined ? undefined : JSON.stringify(input);
    } catch {
        throw new FinanceApiError(
            "Unable to prepare your Finance request. Check the supplied values.",
            0,
            "INVALID_REQUEST",
        );
    }
    let response: Response;
    try {
        response = await fetch(path, {
            method,
            cache: "no-store",
            credentials: "same-origin",
            headers: {
                Accept: "application/json",
                ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
            },
            ...(body !== undefined ? { body } : {}),
        });
    } catch {
        throw new FinanceApiError(
            "Unable to reach the Finance service. Check your connection and try again.",
            0,
            "NETWORK_ERROR",
        );
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
        const code = isObject(payload) && typeof payload.error === "string" &&
            /^[A-Z][A-Z0-9_]*$/.test(payload.error) ? payload.error : undefined;
        // Expected client errors carry actionable messages. Unexpected/server failures
        // use our fallback, so proxy diagnostics and server internals never become UI text.
        const message = [400, 401, 404, 409].includes(response.status) && code &&
            isObject(payload) && typeof payload.message === "string" && payload.message.trim()
            ? payload.message : fallback;
        throw new FinanceApiError(message, response.status, code);
    }
    if (!isObject(payload)) throw invalidResponse(response.status);
    return { payload, status: response.status };
}

async function saveResource<T>(
    path: string,
    method: "POST" | "PUT",
    key: ResourceKey,
    input: BankAccountInput | InvestmentInput | LiabilityInput | FinanceTransactionInput,
    fallback: string,
): Promise<T> {
    const { payload, status } = await request(path, method, fallback, input);
    if (!isObject(payload[key])) throw invalidResponse(status);
    // Field-level DTO validation remains the server's responsibility; check envelopes here.
    return payload[key] as T;
}

async function deleteResource(path: string, fallback: string): Promise<void> {
    const { payload, status } = await request(path, "DELETE", fallback);
    if (payload.success !== true) throw invalidResponse(status);
}

async function getFinanceData(): Promise<FinanceDataResponse> {
    const { payload, status } = await request(
        "/api/finance",
        "GET",
        "Unable to load your finance data.",
    );
    for (const key of ["accounts", "investments", "liabilities", "transactions", "positionHistory"]) {
        if (!Array.isArray(payload[key])) throw invalidResponse(status);
    }
    return payload as unknown as FinanceDataResponse;
}

async function createAccount(input: BankAccountInput): Promise<BankAccountDto> {
    return saveResource<BankAccountDto>(
        "/api/finance/accounts",
        "POST",
        "account",
        input,
        "Unable to save your bank account.",
    );
}

async function updateAccount(id: string, input: BankAccountInput): Promise<BankAccountDto> {
    return saveResource<BankAccountDto>(
        `/api/finance/accounts/${encodeURIComponent(id)}`,
        "PUT",
        "account",
        input,
        "Unable to save your bank account.",
    );
}

async function deleteAccount(id: string): Promise<void> {
    return deleteResource(
        `/api/finance/accounts/${encodeURIComponent(id)}`,
        "Unable to delete your bank account.",
    );
}

async function createInvestment(input: InvestmentInput): Promise<InvestmentDto> {
    return saveResource<InvestmentDto>(
        "/api/finance/investments",
        "POST",
        "investment",
        input,
        "Unable to save your investment.",
    );
}

async function updateInvestment(id: string, input: InvestmentInput): Promise<InvestmentDto> {
    return saveResource<InvestmentDto>(
        `/api/finance/investments/${encodeURIComponent(id)}`,
        "PUT",
        "investment",
        input,
        "Unable to save your investment.",
    );
}

async function deleteInvestment(id: string): Promise<void> {
    return deleteResource(
        `/api/finance/investments/${encodeURIComponent(id)}`,
        "Unable to delete your investment.",
    );
}

async function createLiability(input: LiabilityInput): Promise<LiabilityDto> {
    return saveResource<LiabilityDto>(
        "/api/finance/liabilities",
        "POST",
        "liability",
        input,
        "Unable to save your liability.",
    );
}

async function updateLiability(id: string, input: LiabilityInput): Promise<LiabilityDto> {
    return saveResource<LiabilityDto>(
        `/api/finance/liabilities/${encodeURIComponent(id)}`,
        "PUT",
        "liability",
        input,
        "Unable to save your liability.",
    );
}

async function deleteLiability(id: string): Promise<void> {
    return deleteResource(
        `/api/finance/liabilities/${encodeURIComponent(id)}`,
        "Unable to delete your liability.",
    );
}

async function createTransaction(input: FinanceTransactionInput): Promise<FinanceTransactionDto> {
    return saveResource<FinanceTransactionDto>(
        "/api/finance/transactions",
        "POST",
        "transaction",
        input,
        "Unable to save your transaction.",
    );
}

async function updateTransaction(id: string, input: FinanceTransactionInput): Promise<FinanceTransactionDto> {
    return saveResource<FinanceTransactionDto>(
        `/api/finance/transactions/${encodeURIComponent(id)}`,
        "PUT",
        "transaction",
        input,
        "Unable to save your transaction.",
    );
}

async function deleteTransaction(id: string): Promise<void> {
    return deleteResource(
        `/api/finance/transactions/${encodeURIComponent(id)}`,
        "Unable to delete your transaction.",
    );
}

/** No persistence, notifications, retries, or UI/store side effects. */
export const financeApi = {
    getFinanceData,
    createAccount,
    updateAccount,
    deleteAccount,
    createInvestment,
    updateInvestment,
    deleteInvestment,
    createLiability,
    updateLiability,
    deleteLiability,
    createTransaction,
    updateTransaction,
    deleteTransaction,
};
