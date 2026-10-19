import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

interface SkeletonProps extends ComponentProps<"div"> {
    variant?: "rectangle" | "circle" | "text";
}

/** Decorative placeholder. Announce loading once with SkeletonRegion. */
export function Skeleton({
    className,
    variant = "rectangle",
    ...props
}: SkeletonProps) {
    return (
        <div
            {...props}
            aria-hidden="true"
            className={cn(
                "animate-pulse rounded-md bg-border motion-reduce:animate-none",
                variant === "circle" && "rounded-full",
                variant === "text" && "h-3 rounded",
                className,
            )}
        />
    );
}

interface SkeletonRegionProps extends ComponentProps<"div"> {
    label: string;
}

export function SkeletonRegion({
    label,
    children,
    className,
    ...props
}: SkeletonRegionProps) {
    return (
        <div {...props} role="status" aria-busy="true">
            <span className="sr-only">{label}</span>
            <div aria-hidden="true" className={className}>{children}</div>
        </div>
    );
}
