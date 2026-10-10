"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { forwardRef } from "react";
import type {
    ComponentPropsWithoutRef,
    ComponentRef,
} from "react";

import { cn } from "@/lib/utils/cn";

export const DropdownMenu = DropdownMenuPrimitive.Root;

export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export const DropdownMenuGroup = DropdownMenuPrimitive.Group;

export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

export const DropdownMenuSeparator = forwardRef<
    ComponentRef<typeof DropdownMenuPrimitive.Separator>,
    ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
    <DropdownMenuPrimitive.Separator
        ref={ref}
        className={cn(
            "my-1 h-px bg-border-subtle",
            className,
        )}
        {...props}
    />
));

DropdownMenuSeparator.displayName =
    DropdownMenuPrimitive.Separator.displayName;

export const DropdownMenuContent = forwardRef<
    ComponentRef<typeof DropdownMenuPrimitive.Content>,
    ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
    <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
            ref={ref}
            sideOffset={sideOffset}
            className={cn(
                "z-50 min-w-36 overflow-hidden rounded-lg",
                "border border-border bg-surface p-1 shadow-lg",
                "text-text-primary outline-none",
                className,
            )}
            {...props}
        />
    </DropdownMenuPrimitive.Portal>
));

DropdownMenuContent.displayName =
    DropdownMenuPrimitive.Content.displayName;

export const DropdownMenuItem = forwardRef<
    ComponentRef<typeof DropdownMenuPrimitive.Item>,
    ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
    <DropdownMenuPrimitive.Item
        ref={ref}
        className={cn(
            "relative flex cursor-pointer select-none items-center",
            "gap-2 rounded-md px-2.5 py-2 text-xs outline-none",
            "transition-colors",
            "data-highlighted:bg-surface-elevated",
            "data-disabled:pointer-events-none",
            "data-disabled:opacity-50",
            className,
        )}
        {...props}
    />
));

DropdownMenuItem.displayName =
    DropdownMenuPrimitive.Item.displayName;