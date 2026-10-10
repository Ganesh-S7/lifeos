import { LucideIcon, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Card } from "./card";

type Trend = "up" | "down" | "neutral";
type TrendTone = "positive" | "negative" | "neutral";

interface StatProps {
  label: string;
  value: string;
  description?: string;
  trend?: Trend;
  trendTone?: TrendTone;
  icon?: LucideIcon;
}

export function Stat({
  label,
  value,
  description,
  trend = "neutral",
  trendTone,
  icon: Icon,
}: StatProps) {
  const resolvedTrendTone: TrendTone =
    trendTone ??
    (trend === "up"
      ? "positive"
      : trend === "down"
        ? "negative"
        : "neutral");

  const trendToneClasses: Record<TrendTone, string> = {
    positive: "text-success",
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
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-text-secondary">
            {label}
          </p>

          <p className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">
            {value}
          </p>
        </div>

        {Icon && (
          <div className="flex size-9 items-center justify-center rounded-md bg-surface-elevated text-text-secondary">
            <Icon className="size-4" />
          </div>
        )}
      </div>

      {(description || TrendIcon) && (
        <div className="mt-3 flex items-center gap-1.5">
          {TrendIcon && (
            <TrendIcon
              className={cn(
                "size-3.5",
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
    </Card>
  );
}