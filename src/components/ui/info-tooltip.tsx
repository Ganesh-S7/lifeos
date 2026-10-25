"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Info } from "lucide-react";

/** A nonmodal explanation: hover/focus to read, or tap/click to toggle. */
export function InfoTooltip({ label, children }: { label: string; children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const descriptionId = useId();
    const trigger = useRef<HTMLButtonElement>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    function cancelClose() {
        if (closeTimer.current !== null) {
            clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
    }

    function scheduleClose() {
        cancelClose();
        closeTimer.current = setTimeout(() => {
            closeTimer.current = null;
            if (!trigger.current?.matches(":focus-visible")) setOpen(false);
        }, 150);
    }

    useEffect(() => cancelClose, []);

    return (
        <Popover.Root open={open} onOpenChange={setOpen} modal={false}>
            <span
                className="inline-flex shrink-0"
                onPointerEnter={(event) => {
                    if (event.pointerType === "touch") return;
                    cancelClose();
                    setOpen(true);
                }}
                onPointerLeave={scheduleClose}
            >
                <Popover.Trigger asChild>
                    <button
                        ref={trigger}
                        type="button"
                        aria-label={label}
                        aria-describedby={descriptionId}
                        className="-my-1 inline-flex size-6 items-center justify-center rounded-sm text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        onFocus={(event) => {
                            if (event.currentTarget.matches(":focus-visible")) setOpen(true);
                        }}
                        onBlur={() => {
                            cancelClose();
                            setOpen(false);
                        }}
                    >
                        <Info className="size-3.5" aria-hidden="true" />
                    </button>
                </Popover.Trigger>
                <span id={descriptionId} className="sr-only">{children}</span>
            </span>
            <Popover.Portal>
                <Popover.Content
                    aria-label={label}
                    sideOffset={6}
                    collisionPadding={12}
                    className="z-50 max-w-72 rounded-lg border border-border bg-surface-elevated p-3 text-xs leading-relaxed text-text-secondary shadow-sm outline-none"
                    onPointerEnter={cancelClose}
                    onPointerLeave={scheduleClose}
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    onCloseAutoFocus={(event) => event.preventDefault()}
                >
                    {children}
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
