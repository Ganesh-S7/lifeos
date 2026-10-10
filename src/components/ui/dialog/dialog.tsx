"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentPropsWithoutRef, ComponentRef } from "react";
import { forwardRef } from "react";

import { cn } from "@/lib/utils/cn";

export const Dialog = DialogPrimitive.Root;

export const DialogTrigger = DialogPrimitive.Trigger;

export const DialogClose = DialogPrimitive.Close;

export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = forwardRef<
    ComponentRef<typeof DialogPrimitive.Overlay>,
    ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => {
    return (
        <DialogPrimitive.Overlay
            ref={ref}
            className={cn(
                "fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]",
                "transition-opacity duration-200",
                "data-[state=closed]:opacity-0 data-[state=open]:opacity-100",
                className
            )}
            {...props}
        />
    );
});

DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export const DialogContent = forwardRef<
    ComponentRef<typeof DialogPrimitive.Content>,
    ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
    return (
        <DialogPortal>
            <DialogOverlay />

            <DialogPrimitive.Content
                ref={ref}
                className={cn(
                    "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)]",
                    "max-w-lg -translate-x-1/2 -translate-y-1/2",
                    "rounded-xl border border-border bg-surface",
                    "p-5 text-text-primary shadow-lg",
                    "outline-none",
                    "transition-[opacity,transform] duration-200",
                    "data-[state=closed]:opacity-0 data-[state=open]:opacity-100",
                    "data-[state=closed]:scale-95 data-[state=open]:scale-100",
                    className
                )}
                {...props}
            >
                {children}

                <DialogPrimitive.Close
                    className={cn(
                        "absolute right-4 top-4 rounded-md p-1.5",
                        "text-text-muted transition-colors",
                        "hover:bg-surface-elevated hover:text-text-primary",
                        "focus-visible:outline-none focus-visible:ring-2",
                        "focus-visible:ring-primary/40"
                    )}
                    aria-label="Close dialog"
                >
                    <X className="size-4" />
                </DialogPrimitive.Close>
            </DialogPrimitive.Content>
        </DialogPortal>
    );
});

DialogContent.displayName = DialogPrimitive.Content.displayName;

export function DialogHeader({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn("flex flex-col gap-1.5", className)}
            {...props}
        />
    );
}

export function DialogTitle({
    className,
    ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
    return (
        <DialogPrimitive.Title
            className={cn(
                "text-base font-semibold tracking-tight text-text-primary",
                className
            )}
            {...props}
        />
    );
}

export function DialogDescription({
    className,
    ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
    return (
        <DialogPrimitive.Description
            className={cn(
                "text-xs leading-5 text-text-secondary",
                className
            )}
            {...props}
        />
    );
}

export function DialogFooter({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
                className
            )}
            {...props}
        />
    );
}