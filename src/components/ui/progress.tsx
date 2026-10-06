import { cn } from "@/lib/utils/cn";

interface ProgressProps {
  value: number;
  max?: number;
  className?: string;
}

export function Progress({
  value,
  max = 100,
  className,
}: ProgressProps) {
  const percentage = Math.min(
    100,
    Math.max(0, (value / max) * 100)
  );

  return (
    <div
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-surface-elevated",
        className
      )}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}