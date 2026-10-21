import "./helpers/register-typescript.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

const storeUrl = new URL("../src/features/finance/store/finance-store.ts", import.meta.url).href;
const key = "lifeos.finance-initialization-test";
const dependencies = {
    session: { data: null, isPending: true }, effects: [], reads: 0, serverRender: false,
};
globalThis[Symbol.for(key)] = dependencies;
const ref = `globalThis[Symbol.for(${JSON.stringify(key)})]`;
const stubs = {
    react: `
        export function useEffect(effect) { ${ref}.effects.push(effect); }
        export function useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
            return ${ref}.serverRender ? getServerSnapshot() : getSnapshot();
        }
    `,
    "@/lib/auth-client": `export const authClient = { useSession: () => ${ref}.session };`,
    "../api/finance-api": `export const financeApi = {
        getFinanceData: () => { ${ref}.reads++; return ${ref}.read(); }
    };`,
};
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (context.parentURL === storeUrl && stubs[specifier]) {
            return {
                url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`,
                shortCircuit: true,
            };
        }
        return nextResolve(specifier, context);
    },
});
const { useFinance } = await import(storeUrl);
const empty = () => ({ accounts: [], investments: [], liabilities: [], transactions: [], positionHistory: [] });
const account = {
    id: "account-a", name: "Owned account", balanceSnapshot: 10,
    balanceSnapshotAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function flushEffects() {
    const effects = dependencies.effects.splice(0);
    effects.forEach((effect) => effect());
    await tick();
}

test("actual useFinance facade waits for auth, deduplicates consumers, masks stale data before effects, and retries", async () => {
    dependencies.read = async () => ({ ...empty(), accounts: [account] });
    assert.equal(useFinance().ready, false);
    await flushEffects();
    assert.equal(dependencies.reads, 0);
    dependencies.session = { data: { user: { id: "user-a" } }, isPending: false };
    useFinance();
    useFinance();
    await flushEffects();
    assert.equal(dependencies.reads, 1);
    assert.deepEqual(useFinance().data.accounts, [account]);
    dependencies.effects = [];

    // Server rendering uses a stable empty snapshot regardless of in-memory client data.
    dependencies.serverRender = true;
    assert.deepEqual(useFinance().data, empty());
    dependencies.serverRender = false;
    dependencies.effects = [];

    dependencies.session = { data: { user: { id: "user-b" } }, isPending: false };
    dependencies.read = async () => { throw new Error("Unavailable"); };
    const switched = useFinance();
    assert.equal(switched.ready, false);
    assert.deepEqual(switched.data, empty());
    await flushEffects();
    assert.match(useFinance().loadError, /Unavailable/);
    dependencies.effects = [];
    dependencies.read = async () => empty();
    useFinance().retry();
    await tick();
    assert.equal(useFinance().ready, true);
    assert.deepEqual(useFinance().data, empty());
    dependencies.effects = [];

    dependencies.session = { data: null, isPending: false };
    assert.equal(useFinance().ready, false);
    assert.deepEqual(useFinance().data, empty());
    await flushEffects();
    assert.match(useFinance().loadError, /Sign in/);
    const reads = dependencies.reads;
    useFinance().retry();
    await tick();
    assert.equal(dependencies.reads, reads);
});
