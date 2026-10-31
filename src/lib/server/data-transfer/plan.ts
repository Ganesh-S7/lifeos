import {
    canonical, healthTargetsFingerprint, healthTargetsReplacementSchema, models,
    normalizeEmail, requireTransfer, sha256, TransferError,
    type HealthTargetsReplacement, type Model, type OperationCounts,
    type RecordSet, type TransferPackage,
} from "./contracts";
import { builtInExpenseCategories, categoryNameKey } from "../../../features/finance/utils/expense-categories";

export interface Owner {
    id: string;
    email: string;
}
export function verifyOwner(matches: Owner[], explicitId: string, email: string) {
    const normalized = normalizeEmail(email);
    requireTransfer(matches.length === 1 && matches[0].id === explicitId &&
        normalizeEmail(matches[0].email) === normalized, "OWNER_MAPPING_REJECTED");
    return matches[0];
}

export function mappedId(pkg: TransferPackage, destinationOwner: string, model: Model, sourceId: string) {
    return `lx_${sha256(canonical([
        "lifeos-transfer/v1", pkg.manifest.source.fingerprint, pkg.manifest.source.ownerId,
        destinationOwner, model, sourceId,
    ]))}`;
}

export interface CreateAction {
    model: Model;
    record: RecordSet[Model][number];
}
export interface ReplaceHealthTargetsAction {
    model: "healthTargets";
    record: RecordSet["healthTargets"][number];
    approval: Extract<HealthTargetsReplacement, { enabled: true }>;
}
export interface TransferPlan {
    counts: Record<Model, OperationCounts>;
    conflicts: { model: Model; code: string }[];
    mappings: { model: Model; sourceId: string; destinationId: string }[];
    creates: CreateAction[];
    replacements: ReplaceHealthTargetsAction[];
}
export interface DestinationData {
    records: RecordSet;
    /** Global mapped-ID probes, including IDs held by a different owner. */
    identifiers: { model: Model; id: string; userId: string }[];
}

function comparable(model: Model, row: RecordSet[Model][number]) {
    const result: Record<string, unknown> = { ...row };
    delete result.userId;
    delete result.id;
    // Finance equality is about historical values; existing metadata is retained.
    if (model === "monthlyFinanceSnapshot" || model === "financeSpendingPlan") {
        delete result.createdAt;
        delete result.updatedAt;
    }
    return canonical(result);
}

export function planTransfer(
    pkg: TransferPackage,
    destinationOwner: string,
    destination: DestinationData,
    replacement: HealthTargetsReplacement = { enabled: false },
): TransferPlan {
    const parsed = healthTargetsReplacementSchema.safeParse(replacement);
    requireTransfer(parsed.success, "INVALID_REPLACEMENT_APPROVAL");
    const approval = parsed.data;
    requireTransfer(!approval.enabled || approval.destinationUserId === destinationOwner, "REPLACEMENT_OWNER_MISMATCH");
    requireTransfer(destination.records.healthTargets.length <= 1, "DESTINATION_TARGETS_INVALID");
    requireTransfer(models.every((model) => destination.records[model].every((row) => row.userId === destinationOwner)), "DESTINATION_RECORD_OWNER_MISMATCH");
    const result: TransferPlan = {
        counts: Object.fromEntries(models.map((model) => [model, {
            create: 0, replace: 0, skip: 0, conflict: 0,
        }])) as TransferPlan["counts"],
        conflicts: [], mappings: [], creates: [], replacements: [],
    };
    for (const model of models) {
        for (const source of pkg.records[model]) {
            const sourceId = "id" in source ? source.id : source.userId;
            const id = model === "financeSpendingPlan" ? destinationOwner : mappedId(pkg, destinationOwner, model, sourceId);
            const record = { ...source, userId: destinationOwner, ...("id" in source ? { id } : {}) };
            const collision = destination.identifiers.find((item) => item.model === model && item.id === id);
            const existing = destination.records[model].find((row) => {
                if ("date" in source && "date" in row) return row.date === source.date;
                if ("month" in source && "month" in row) return row.month === source.month;
                if ("normalizedName" in source && "normalizedName" in row) return categoryNameKey(row.name) === source.normalizedName;
                return model === "healthTargets" || model === "financeSpendingPlan";
            });
            let conflict: string | undefined;
            let replace = false;
            if (collision && collision.userId !== destinationOwner) conflict = "ID_OWNED_BY_ANOTHER_USER";
            else if (collision && (!existing || !("id" in existing) || existing.id !== id)) conflict = "ID_COLLISION";
            else if (model === "healthTargets" && approval.enabled &&
                (!existing || !("id" in existing) || existing.id !== approval.recordId)) {
                conflict = "HEALTH_TARGETS_REVIEW_STALE";
            } else if (existing && model !== "expenseCategory" && comparable(model, existing) !== comparable(model, record)) {
                if (model === "healthTargets" && approval.enabled) {
                    if (healthTargetsFingerprint(existing) === approval.expectedSHA256) {
                        replace = true;
                    } else {
                        conflict = "HEALTH_TARGETS_REVIEW_STALE";
                    }
                } else {
                    conflict = model === "healthLog" ? "SAME_DATE_CONFLICT" : "EXISTING_RECORD_DIFFERS";
                }
            }
            if (conflict) {
                result.counts[model].conflict++;
                result.conflicts.push({ model, code: conflict });
                continue;
            }
            const builtIn = model === "expenseCategory" && "name" in source &&
                builtInExpenseCategories.some((name) => categoryNameKey(name) === categoryNameKey(source.name));
            if (replace && model === "healthTargets" && approval.enabled) {
                // Only the values and source timestamp move; destination identity stays.
                result.replacements.push({
                    model: "healthTargets",
                    record: {
                        ...pkg.records.healthTargets[0],
                        id: approval.recordId,
                        userId: destinationOwner,
                    },
                    approval,
                });
                result.counts.healthTargets.replace++;
            } else if (existing || builtIn) {
                result.counts[model].skip++;
            } else {
                result.counts[model].create++;
                result.creates.push({ model, record });
            }
            result.mappings.push({
                model, sourceId,
                destinationId: existing && "id" in existing ? existing.id : builtIn ? "built-in" : id,
            });
        }
    }
    return result;
}

/** No generic update/upsert/delete or auth/ledger operations. */
export interface TransferWriter {
    create(action: CreateAction): Promise<void>;
    replaceHealthTargets(action: ReplaceHealthTargetsAction): Promise<void>;
}
export async function executePlan(plan: TransferPlan, writer: TransferWriter, dryRun: boolean) {
    if (plan.conflicts.length && !dryRun) {
        throw new TransferError("UNRESOLVED_CONFLICTS", { counts: plan.counts, conflicts: plan.conflicts });
    }
    if (!dryRun) {
        for (const action of plan.replacements) {
            await writer.replaceHealthTargets(action);
        }
        for (const action of plan.creates) {
            await writer.create(action);
        }
    }
    return { counts: plan.counts, conflicts: plan.conflicts, applied: !dryRun };
}
