import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

type BadgeVariant =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variants: Record<BadgeVariant, string> = {
  neutral:
    "bg-surface-elevated text-text-secondary border-border",

  brand:
    "bg-primary-subtle text-primary border-transparent",

  success:
    "bg-success-subtle text-success-foreground border-transparent",

  warning:
    "bg-warning-subtle text-warning-foreground border-transparent",

  danger:
    "bg-danger-subtle text-danger-foreground border-transparent",

  info:
    "bg-info-subtle text-info-foreground border-transparent",
};

export function Badge({
  className,
  variant = "neutral",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5",
        "text-[11px] font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}