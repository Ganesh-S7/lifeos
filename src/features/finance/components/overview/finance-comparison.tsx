import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";
import type { Comparison } from "../../utils/finance-comparisons";

interface FinanceComparisonProps {
  comparison: Comparison;
  period: "since last month" | "vs previous period";
  unit?: "currency" | "points";
  recordedValue?: boolean;
}

export function FinanceComparison({
  comparison,
  period,
  unit = "currency",
  recordedValue = false,
}: FinanceComparisonProps) {
  if (!comparison.available) {
    return <p className="text-xs text-text-muted">{comparison.reason}</p>;
  }

  if (comparison.direction === "unchanged") {
    return <p className="text-xs text-text-muted">No change {period}</p>;
  }

  const toneClass =
    comparison.tone === "positive"
      ? "text-success"
      : comparison.tone === "negative"
        ? "text-danger"
        : "text-text-muted";
  const amount =
    unit === "points"
      ? `${comparison.absoluteChange.toFixed(1)} percentage points`
      : formatCurrency(comparison.absoluteChange);
  const percentage =
    unit === "currency" && comparison.percentage !== null
      ? ` (${comparison.percentage.toFixed(1)}%)`
      : "";
  const periodText = recordedValue ? `in recorded value ${period}` : period;
  const DirectionIcon =
    comparison.direction === "up" ? ArrowUpRight : ArrowDownRight;

  return (
    <p className={cn("flex items-start gap-1.5 text-xs leading-5", toneClass)}>
      <span className="sr-only">
        {comparison.tone === "positive"
          ? "Favourable change. "
          : comparison.tone === "negative"
            ? "Unfavourable change. "
            : "Change. "}
      </span>
      <DirectionIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <span className="sr-only">
          {comparison.direction === "up" ? "Increased by " : "Decreased by "}
        </span>
        {amount}
        {percentage} {periodText}
      </span>
    </p>
  );
}
