"use client";

import {
  Bell,
  LogOut,
  Menu,
  Search,
  Sun,
} from "lucide-react";
import { IconButton, Skeleton } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const router = useRouter();

  const { data: session, isPending } = authClient.useSession();

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  const userName =
    session?.user.name?.trim() || "Personal account";
  const initialSessionLoading = isPending && !session;

  const initials =
    userName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase() || "U";

  async function handleSignOut() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    setSignOutError("");

    try {
      const { error } = await authClient.signOut();

      if (error) {
        setSignOutError(
          "Unable to sign out. Please try again.",
        );
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setSignOutError(
        "Something went wrong while signing out.",
      );
    } finally {
      setIsSigningOut(false);
    }
  }

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

          {/* Authenticated user */}
          <div className="ml-1 flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5">
            {initialSessionLoading ? (
              <>
                <Skeleton variant="circle" className="size-8 shrink-0" />
                <span className="sr-only">Loading account</span>
              </>
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {initials}
              </span>
            )}

            <div className="hidden min-w-0 text-left xl:block">
              {initialSessionLoading ? (
                <Skeleton variant="text" className="w-24" />
              ) : (
                <p className="max-w-36 truncate text-[11px] font-medium text-text-primary">
                  {userName}
                </p>
              )}

              <p className="max-w-36 truncate text-[10px] text-text-muted">
                Personal account
              </p>
            </div>
          </div>

          {/* Sign out */}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut || isPending || !session}
            aria-label="Sign out"
            title="Sign out"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSigningOut ? (
              <span
                className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden="true"
              />
            ) : (
              <LogOut
                className="size-4"
                aria-hidden="true"
              />
            )}
          </button>
        </div>
      </div>
      {signOutError && (
        <p
          role="alert"
          className="absolute right-4 top-full mt-2 rounded-lg border border-danger/20 bg-surface px-3 py-2 text-sm text-danger shadow-lg"
        >
          {signOutError}
        </p>
      )}
    </header>
  );
}
