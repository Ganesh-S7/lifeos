"use client";

import {
  Bell,
  Menu,
  Search,
  Sun,
} from "lucide-react";
import { IconButton } from "@/components/ui";

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 h-16 border-b border-border-subtle bg-background/85 backdrop-blur-xl">
      <div className="flex h-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Left */}
        <div className="flex min-w-0 items-center gap-3">
          <IconButton
            className="lg:hidden"
            onClick={onMenuClick}
            aria-label="Open navigation"
          >
            <Menu className="size-4.5" />
          </IconButton>

          <div className="hidden items-center gap-2 text-xs text-text-muted sm:flex">
            <span>LifeOS</span>
            <span>/</span>
            <span className="text-text-secondary">Overview</span>
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-1.5">
          {/* Search */}
          <button
            type="button"
            className="hidden h-9 w-60 items-center gap-2 rounded-md border border-border-subtle bg-surface px-3 text-left transition-colors hover:border-border hover:bg-surface-elevated lg:flex"
          >
            <Search className="size-3.5 text-text-muted" />

            <span className="text-xs text-text-muted">
              Search anything...
            </span>

            <div className="ml-auto flex items-center gap-0.5">
              <kbd className="flex size-5 items-center justify-center rounded border border-border bg-surface-elevated text-[9px] text-text-muted">
                ⌘
              </kbd>

              <kbd className="flex size-5 items-center justify-center rounded border border-border bg-surface-elevated text-[9px] text-text-muted">
                K
              </kbd>
            </div>
          </button>

          {/* Mobile search */}
          <IconButton className="lg:hidden" aria-label="Search">
            <Search className="size-4.25" />
          </IconButton>

          {/* Theme */}
          <IconButton aria-label="Toggle theme">
            <Sun className="size-4.25" />
          </IconButton>

          {/* Notifications */}
          <IconButton className="relative" aria-label="Notifications">
            <Bell className="size-4.25" />

            <span className="absolute right-2 top-1.5 size-1.5 rounded-full bg-danger ring-2 ring-background" />
          </IconButton>

          {/* Profile */}
          <button
            type="button"
            className="ml-1 flex items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-surface-elevated"
          >
            <span className="flex size-7 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              GS
            </span>

            <div className="hidden text-left xl:block">
              <p className="text-[11px] font-medium text-text-primary">
                Ganesh S
              </p>
              <p className="text-[10px] text-text-muted">
                Personal
              </p>
            </div>
          </button>
        </div>
      </div>
    </header>
  );
}