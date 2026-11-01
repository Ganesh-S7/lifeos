"use client";

import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Info } from "lucide-react";

// Hover, keyboard and touch openings share the same single active explanation.
let activeTooltip: { id: string; close: () => void } | null = null;

/** A nonmodal explanation: hover/focus to read, or tap/click to toggle. */
export function InfoTooltip({ label, children }: { label: string; children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const descriptionId = useId();
    const trigger = useRef<HTMLButtonElement>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pointerDown = useRef(false);

    function cancelClose() {
        if (closeTimer.current !== null) {
            clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
    }

    function changeOpen(next: boolean) {
        cancelClose();
        if (next) {
            if (activeTooltip?.id !== descriptionId) activeTooltip?.close();
            activeTooltip = {
                id: descriptionId,
                close: () => {
                    cancelClose();
                    setOpen(false);
                },
            };
        } else if (activeTooltip?.id === descriptionId) {
            activeTooltip = null;
        }
        setOpen(next);
    }

    function scheduleClose(event: PointerEvent) {
        pointerDown.current = false;
        if (event.pointerType === "touch") return;
        cancelClose();
        closeTimer.current = setTimeout(() => {
            closeTimer.current = null;
            if (!trigger.current?.matches(":focus-visible")) changeOpen(false);
        }, 150);
    }

    useEffect(() => () => {
        cancelClose();
        if (activeTooltip?.id === descriptionId) activeTooltip = null;
    }, [descriptionId]);

    return (
        <Popover.Root open={open} onOpenChange={changeOpen} modal={false}>
            <span
                className="inline-flex shrink-0"
                onPointerEnter={(event) => {
                    if (event.pointerType === "touch") return;
                    cancelClose();
                    changeOpen(true);
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
                        onPointerDown={() => {
                            // Pointer focus precedes click; let Radix toggle only once.
                            pointerDown.current = true;
                            cancelClose();
                        }}
                        onPointerUp={() => {
                            pointerDown.current = false;
                        }}
                        onPointerCancel={() => {
                            pointerDown.current = false;
                        }}
                        onFocus={(event) => {
                            if (!pointerDown.current && event.currentTarget.matches(":focus-visible")) {
                                changeOpen(true);
                            }
                        }}
                        onBlur={() => {
                            changeOpen(false);
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
                    className="z-50 max-h-[var(--radix-popover-content-available-height)] max-w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto break-words rounded-lg border border-border bg-surface-elevated p-3 text-xs leading-relaxed text-text-secondary shadow-sm outline-none"
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
