import { cn } from "@/lib/utils/cn";
import { forwardRef } from "react";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger";

type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active",

  secondary:
    "border border-border bg-surface-elevated text-text-primary hover:bg-surface-hover",

  outline:
    "border border-border bg-transparent text-text-primary hover:bg-surface-hover",

  ghost:
    "text-text-secondary hover:bg-surface-hover hover:text-text-primary",

  danger:
    "bg-danger text-text-inverse hover:opacity-90",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-11 px-3 text-sm sm:h-8 sm:text-xs",
  md: "h-11 px-4 text-sm sm:h-10",
  lg: "h-11 px-5 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      type = "button",
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md font-medium",
          "whitespace-nowrap transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          "disabled:pointer-events-none disabled:opacity-50",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
