/** True confirms success; false leaves the form/dialog open without resetting values. */
export type FinanceMutationCallback<T> = (values: T) => boolean | Promise<boolean>;

interface MutationFeedback {
    onSuccess?: () => void;
    onError: (cause: unknown) => void;
}

/** A synchronous lock also blocks repeated events before React renders pending state. */
export function createFinanceMutation(onPendingChange: (pending: boolean) => void) {
    let pending = false;

    return {
        isPending: () => pending,
        async run(
            operation: () => boolean | Promise<boolean>,
            feedback: MutationFeedback,
        ): Promise<boolean> {
            if (pending) return false;

            pending = true;
            onPendingChange(true);
            try {
                const succeeded = await operation();
                if (succeeded) feedback.onSuccess?.();
                return succeeded;
            } catch (cause) {
                feedback.onError(cause);
                return false;
            } finally {
                pending = false;
                onPendingChange(false);
            }
        },
    };
}
