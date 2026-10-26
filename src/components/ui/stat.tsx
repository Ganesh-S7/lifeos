import type { ReactNode } from "react";
import { LucideIcon, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Card } from "./card";

type Trend = "up" | "down" | "neutral";
type TrendTone = "positive" | "negative" | "neutral";

interface StatProps {
  label: string;
  labelInfo?: ReactNode;
  value: string;
  description?: string;
  trend?: Trend;
  trendTone?: TrendTone;
  icon?: LucideIcon;
  footer?: ReactNode;
  footerClassName?: string;
  action?: ReactNode;
  className?: string;
}

export function Stat({
  label,
  labelInfo,
  value,
  description,
  trend = "neutral",
  trendTone,
  icon: Icon,
  footer,
  footerClassName,
  action,
  className,
}: StatProps) {
  const resolvedTrendTone: TrendTone =
    trendTone ??
    (trend === "up"
      ? "positive"
      : trend === "down"
        ? "negative"
        : "neutral");

  const trendToneClasses: Record<TrendTone, string> = {
    positive: "text-success-foreground",
    negative: "text-danger",
    neutral: "text-text-muted",
  };
  const TrendIcon =
    trend === "up"
      ? ArrowUpRight
      : trend === "down"
        ? ArrowDownRight
        : null;

  return (
    <Card className={cn("flex flex-col p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium text-text-secondary">{label}</p>
            {labelInfo}
          </div>

          <p className="mt-2 break-words text-2xl font-semibold tabular-nums tracking-tight text-text-primary">
            {value}
          </p>
        </div>

        {Icon && (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-elevated text-text-secondary">
            <Icon className="size-4" />
          </div>
        )}
      </div>

      {(description || TrendIcon) && (
        <div className="mt-3 flex items-start gap-1.5">
          {TrendIcon && (
            <TrendIcon
              className={cn(
                "mt-0.5 size-3.5 shrink-0",
                trendToneClasses[resolvedTrendTone],
              )}
            />
          )}

          {description && (
            <span className="text-xs text-text-secondary">
              {description}
            </span>
          )}
        </div>
      )}

      {footer && <div className={cn("mt-2", footerClassName)}>{footer}</div>}

      {action && (
        <div className="mt-auto border-t border-border-subtle pt-3">
          {action}
        </div>
      )}
    </Card>
  );
}
