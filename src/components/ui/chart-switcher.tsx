"use client";

import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

const ChartSelection = createContext<string | null>(null);

interface ChartSwitcherProps {
  label: string;
  options: readonly { value: string; label: string }[];
  children: ReactNode;
}

/** A phone-only selector; the same chart instances remain in the desktop layout. */
export function ChartSwitcher({ label, options, children }: ChartSwitcherProps) {
  const [selected, setSelected] = useState(options[0]?.value ?? "");
  const labelId = useId();

  return (
    <ChartSelection.Provider value={selected}>
      <section className="grid min-w-0 gap-3 md:block md:space-y-4 lg:space-y-8">
        <div className="md:hidden">
          <h2 id={labelId} className="mb-2 text-sm font-semibold text-text-primary">
            {label}
          </h2>
          <div
            role="group"
            aria-labelledby={labelId}
            className="flex min-w-0 gap-1 overflow-x-auto rounded-lg bg-surface-elevated p-1"
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected === option.value}
                onClick={() => setSelected(option.value)}
                className={cn(
                  "min-h-11 flex-1 shrink-0 whitespace-nowrap rounded-md px-3 text-xs font-medium",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  selected === option.value
                    ? "bg-surface text-primary"
                    : "text-text-secondary hover:bg-surface-hover",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {children}
      </section>
    </ChartSelection.Provider>
  );
}

export function ChartPanel({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  const selected = useContext(ChartSelection);

  return (
    <div
      className={cn(
        "min-w-0 md:contents",
        selected !== null && selected !== value ? "hidden" : "block",
      )}
    >
      {children}
    </div>
  );
}
