import { Button } from "./button";

export function LoadError({
    message,
    onRetry,
}: {
    message: string;
    onRetry: () => void;
}) {
    return (
        <div className="rounded-xl border border-border bg-surface p-6">
            <p role="alert" className="text-sm text-danger">{message}</p>
            <Button type="button" variant="outline" className="mt-4" onClick={onRetry}>
                Retry
            </Button>
        </div>
    );
}
