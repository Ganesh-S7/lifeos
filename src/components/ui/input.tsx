import { forwardRef, useId } from "react";
import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      className,
      id,
      "aria-describedby": ariaDescribedBy,
      "aria-invalid": ariaInvalid,
      required,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();

    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;

    const describedBy =
      [ariaDescribedBy, error ? errorId : undefined]
        .filter(Boolean)
        .join(" ") || undefined;

    return (
      <div className="min-w-0">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-sm font-medium text-text-primary"
          >
            {label}

            {required && (
              <span className="ml-1 text-danger" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}

        <input
          {...props}
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : ariaInvalid}
          aria-describedby={describedBy}
          className={cn(
            "h-10 w-full rounded-md border border-border bg-surface",
            "px-3 text-sm text-text-primary",
            "placeholder:text-text-muted",
            "outline-none transition",
            "focus:border-primary focus:ring-2 focus:ring-primary/15",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-danger focus:border-danger focus:ring-danger/15",
            className,
          )}
        />

        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-1.5 text-xs text-danger"
          >
            {error}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";