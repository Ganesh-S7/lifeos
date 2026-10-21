import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

const clientUrl = new URL("../src/features/finance/api/finance-api.ts", import.meta.url).href;
// Runtime module loading itself verifies this client does not load Prisma, server,
// schema or notification code. All its dependencies must remain type-only.
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (context.parentURL === clientUrl) {
            throw new Error(`Unexpected runtime dependency in Finance client: ${specifier}`);
        }
        return nextResolve(specifier, context);
    },
});
const { financeApi, FinanceApiError } = await import(clientUrl);
const time = "2026-10-20T10:00:00.000Z";
const base = { id: "record-a", name: "Owned record", createdAt: time, updatedAt: time };
const account = { ...base, balanceSnapshot: 100.25, balanceSnapshotAt: time };
const investment = { ...base, type: "Cryptocurrency", valuationSnapshot: 200.25, valuationSnapshotAt: time };
const liability = { ...base, type: "Loan", balance: 300.25, monthlyPayment: 20.50 };
const ordinary = { amount: 10.25, description: "Recorded", date: "2026-10-20", accountId: "bank-a" };
const inputs = [
    { ...ordinary, type: "income", category: null, note: null },
    { ...ordinary, type: "expense", category: "Food", note: "Lunch" },
    { ...ordinary, type: "transfer", destinationAccountId: "bank-b" },
    { ...ordinary, type: "investment_purchase", investmentId: "holding-a" },
    { ...ordinary, type: "investment_sale", investmentId: "holding-a", note: "Sale" },
];
const empty = { accounts: [], investments: [], liabilities: [], transactions: [], positionHistory: [] };

function json(payload, status = 200) {
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function mockFetch(t, respond) {
    const calls = [];
    t.mock.method(globalThis, "fetch", async (url, options) => {
        calls.push({ url, options });
        return respond(url, options);
    });
    return calls;
}

test("getFinanceData returns all collections and uses an uncached same-origin GET", async (t) => {
    const data = {
        accounts: [account], investments: [investment], liabilities: [liability],
        transactions: [{ ...inputs[2], id: "transfer-a", recordedAt: time }],
        positionHistory: [{ id: "position-a", recordedAt: time, bank: 100.25, investments: 200.25, debt: 300.25 }],
    };
    const calls = mockFetch(t, () => json(data));
    assert.deepEqual(await financeApi.getFinanceData(), data);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/finance");
    assert.equal(calls[0].options.method, "GET");
    assert.equal(calls[0].options.cache, "no-store");
    assert.equal(calls[0].options.credentials, "same-origin");
    assert.equal(calls[0].options.headers.Accept, "application/json");
    assert.equal(calls[0].options.body, undefined);
});

test("empty Finance collections remain empty without loading local data", async (t) => {
    mockFetch(t, () => json(empty));
    assert.deepEqual(await financeApi.getFinanceData(), empty);
});

const resources = [
    { name: "Account", path: "accounts", key: "account", body: { name: "Everyday", balance: 100.25 }, dto: account },
    { name: "Investment", path: "investments", key: "investment", body: { name: "Holding", type: "Cryptocurrency", value: 200.25 }, dto: investment },
    { name: "Liability", path: "liabilities", key: "liability", body: { name: "Loan", type: "Loan", balance: 300.25, monthlyPayment: null }, dto: liability },
    { name: "Transaction", path: "transactions", key: "transaction", body: inputs[1], dto: { ...inputs[1], id: "expense-a", recordedAt: time } },
];

test("all create/update methods use exact paths, methods, JSON bodies and unwrapped resource DTOs", async (t) => {
    const id = "id/with ?&=#%+₹";
    let response;
    const calls = mockFetch(t, () => json(response, 201));
    for (const resource of resources) {
        response = { [resource.key]: resource.dto };
        for (const verb of ["create", "update"]) {
            const method = financeApi[`${verb}${resource.name}`];
            const result = verb === "create" ? await method(resource.body) : await method(id, resource.body);
            assert.deepEqual(result, resource.dto);
            const call = calls.at(-1);
            assert.equal(call.url, `/api/finance/${resource.path}${verb === "create" ? "" : `/${encodeURIComponent(id)}`}`);
            assert.equal(call.options.method, verb === "create" ? "POST" : "PUT");
            assert.equal(call.options.headers["Content-Type"], "application/json");
            assert.equal(call.options.cache, "no-store");
            assert.deepEqual(JSON.parse(call.options.body), resource.body);
        }
    }
    assert.equal(calls.length, 8);
});

test("all deletes encode IDs, verify success envelopes and consistently resolve to void", async (t) => {
    const id = "id/with ?&#%₹";
    const calls = mockFetch(t, () => json({ success: true }));
    for (const resource of resources) {
        assert.equal(await financeApi[`delete${resource.name}`](id), undefined);
        const call = calls.at(-1);
        assert.equal(call.url, `/api/finance/${resource.path}/${encodeURIComponent(id)}`);
        assert.equal(call.options.method, "DELETE");
        assert.equal(call.options.body, undefined);
        assert.equal(call.options.headers["Content-Type"], undefined);
    }
    assert.equal(calls.length, 4);
});

test("all five transaction variants preserve fields and ISO/date-only DTO values", async (t) => {
    const calls = mockFetch(t, (_url, options) => {
        const body = JSON.parse(options.body);
        // Mirror server normalization of nullable note/category input.
        const dto = Object.fromEntries(Object.entries(body).filter(([, value]) => value !== null));
        return json({ transaction: { ...dto, id: "transaction-a", recordedAt: time } });
    });
    for (const body of inputs) {
        const created = await financeApi.createTransaction(body);
        const updated = await financeApi.updateTransaction("transaction-a", body);
        assert.equal(created.type, body.type);
        assert.equal(updated.type, body.type);
        assert.equal(created.date, body.date);
        assert.equal(updated.recordedAt, time);
        assert.equal(created.amount, 10.25);
        assert.equal(created.destinationAccountId, body.destinationAccountId);
        assert.equal(created.investmentId, body.investmentId);
        assert.deepEqual(JSON.parse(calls.at(-1).options.body), body);
    }
    assert.equal(calls.length, 10);
});

test("nullable and omitted request fields match the server JSON contract without coercion", async (t) => {
    const calls = mockFetch(t, () => json({ liability }));
    await financeApi.createLiability({ name: "Loan", type: "Loan", balance: 10, monthlyPayment: null });
    assert.equal(JSON.parse(calls[0].options.body).monthlyPayment, null);
    await financeApi.updateLiability("loan", { name: "Loan", type: "Loan", balance: 10, monthlyPayment: undefined });
    assert.equal("monthlyPayment" in JSON.parse(calls[1].options.body), false);
});

test("expected API errors reject with the actual status, stable code and actionable server message", async (t) => {
    let payload;
    let status;
    mockFetch(t, () => json(payload, status));
    for (const [httpStatus, code, message] of [
        [401, "UNAUTHORIZED", "Please sign in to access your finance data."],
        [400, "INVALID_INPUT", "Please check the transaction details."],
        [404, "NOT_FOUND", "Transaction not found."],
        [409, "NEGATIVE_BALANCE", "Everyday would have a negative balance."],
        [409, "AMBIGUOUS_LEDGER_ORDER", "Transactions share a recording timestamp and their order affects available funds."],
        [409, "ACCOUNT_HAS_TRANSACTIONS", "This account has transactions. Delete or move those transactions first."],
    ]) {
        status = httpStatus;
        payload = { error: code, message, details: { stack: "PRIVATE_DIAGNOSTIC" } };
        await assert.rejects(financeApi.getFinanceData(), (error) => {
            assert.ok(error instanceof FinanceApiError);
            assert.equal(error.name, "FinanceApiError");
            assert.equal(error.status, status);
            assert.equal(error.code, code);
            assert.equal(error.message, message);
            assert.equal(error.details, undefined);
            assert.equal(error.message.includes("PRIVATE_DIAGNOSTIC"), false);
            return true;
        });
    }
});

test("unexpected server errors keep their code/status but never expose server or proxy diagnostics", async (t) => {
    mockFetch(t, () => json({ error: "INTERNAL_SERVER_ERROR", message: "PRIVATE_STACK_WITH_DATABASE_CREDENTIALS", stack: "PRIVATE_STACK" }, 500));
    await assert.rejects(financeApi.createAccount(resources[0].body), (error) => {
        assert.equal(error.status, 500);
        assert.equal(error.code, "INTERNAL_SERVER_ERROR");
        assert.equal(error.message, "Unable to save your bank account.");
        assert.equal(error.message.includes("PRIVATE"), false);
        return true;
    });
});

test("non-JSON error responses produce safe fallbacks while preserving HTTP status", async (t) => {
    mockFetch(t, () => new Response("<html>PRIVATE_PROXY_DIAGNOSTIC</html>", { status: 502 }));
    await assert.rejects(financeApi.getFinanceData(), {
        name: "FinanceApiError", status: 502, message: "Unable to load your finance data.", code: undefined,
    });
});

test("malformed JSON error shapes cannot become UI messages", async (t) => {
    let body;
    mockFetch(t, () => json(body, 400));
    for (const payload of [null, [], "PRIVATE_DIAGNOSTIC", { message: 42 }, { error: 42, message: "PRIVATE" }, { error: "INVALID_INPUT", message: " " }]) {
        body = payload;
        await assert.rejects(financeApi.getFinanceData(), {
            name: "FinanceApiError", status: 400, message: "Unable to load your finance data.",
        });
    }
});

test("invalid successful JSON/envelopes fail explicitly instead of returning null or undefined", async (t) => {
    let body;
    mockFetch(t, () => new Response(body, { status: 200 }));
    for (const payload of ["not JSON", "null", "[]", "{}", JSON.stringify({ ...empty, positionHistory: null })]) {
        body = payload;
        await assert.rejects(financeApi.getFinanceData(), { status: 200, code: "INVALID_RESPONSE" });
    }
    for (const payload of ["{}", '{"account":null}', '{"account":[]}']) {
        body = payload;
        await assert.rejects(financeApi.createAccount(resources[0].body), { status: 200, code: "INVALID_RESPONSE" });
    }
});

test("delete responses must explicitly confirm success", async (t) => {
    let payload;
    mockFetch(t, () => json(payload));
    for (const resource of resources) {
        for (const body of [{}, { success: false }, { success: "true" }, null]) {
            payload = body;
            await assert.rejects(financeApi[`delete${resource.name}`]("record"), { code: "INVALID_RESPONSE" });
        }
    }
});

test("network failures are not swallowed, retried or exposed as raw transport diagnostics", async (t) => {
    const calls = mockFetch(t, () => { throw new Error("PRIVATE_NETWORK_DIAGNOSTIC"); });
    await assert.rejects(financeApi.getFinanceData(), {
        name: "FinanceApiError", status: 0, code: "NETWORK_ERROR",
        message: "Unable to reach the Finance service. Check your connection and try again.",
    });
    assert.equal(calls.length, 1);
});

test("serialization failures reject before fetch and do not leak request values", async (t) => {
    const calls = mockFetch(t, () => json({ account }));
    const body = { name: "Circular", balance: 1 };
    body.loop = body;
    await assert.rejects(financeApi.createAccount(body), {
        name: "FinanceApiError", status: 0, code: "INVALID_REQUEST",
    });
    assert.equal(calls.length, 0);
});

test("client module loads and operates with no runtime imports or notification dependencies", async (t) => {
    const calls = mockFetch(t, () => json(empty));
    // The import hook above rejects every runtime import by this module, including
    // Sonner, notify, schemas, server services and Prisma. Actual requests need only fetch.
    assert.deepEqual(await financeApi.getFinanceData(), empty);
    assert.equal(calls.length, 1);
    assert.equal(Object.keys(financeApi).length, 13);
});
