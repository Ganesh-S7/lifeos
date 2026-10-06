import { LucideIcon, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Card } from "./card";

type Trend = "up" | "down" | "neutral";

interface StatProps {
  label: string;
  value: string;
  description?: string;
  trend?: Trend;
  icon?: LucideIcon;
}

export function Stat({
  label,
  value,
  description,
  trend = "neutral",
  icon: Icon,
}: StatProps) {
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
                trend === "up" && "text-success",
                trend === "down" && "text-danger"
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