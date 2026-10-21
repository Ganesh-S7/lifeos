import {
    useHealthStore,
    type SaveHealthLogInput,
    type SaveHealthTargetsInput,
} from "./health-store";

export const healthActions = {
    saveLog: (input: SaveHealthLogInput) =>
        useHealthStore.getState().saveLog(input),

    deleteLog: (id: string) =>
        useHealthStore.getState().deleteLog(id),

    saveTargets: (targets: SaveHealthTargetsInput) =>
        useHealthStore.getState().saveTargets(targets),

    clearTargets: () =>
        useHealthStore.getState().clearTargets(),
};