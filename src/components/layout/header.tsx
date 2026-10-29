"use client";

import { LogOut, Menu } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Breadcrumbs } from "./breadcrumbs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Skeleton,
} from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function Header() {
  const router = useRouter();

  const { data: session, isPending } = authClient.useSession();

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const signOutPending = useRef(false);

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
    if (signOutPending.current) {
      return;
    }

    signOutPending.current = true;
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
      signOutPending.current = false;
      setIsSigningOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-30 h-14 md:h-16 border-b border-border-subtle bg-background">
      <div className="mx-auto flex h-full w-full max-w-376 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Left */}
        <div className="flex min-w-0 items-center gap-3">
          <Dialog.Trigger asChild>
            <IconButton
              className="hidden md:inline-flex lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="size-4.5" />
            </IconButton>
          </Dialog.Trigger>

          <Breadcrumbs />
        </div>

        {/* Right */}
        <div className="flex items-center gap-1.5">
          {/* Theme */}
          <ThemeToggle />

          {/* Authenticated user */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Account menu for ${userName}`}
                disabled={isSigningOut || isPending || !session}
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-md p-1 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50 sm:min-h-9 sm:min-w-9"
              >
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
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={8}
              collisionPadding={12}
              aria-label="Account"
              className="w-64 max-w-[calc(100vw-1.5rem)] max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto shadow-sm"
            >
              <div className="flex items-start gap-2.5 px-2.5 py-3">
                <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  {initials}
                </span>
                <div className="min-w-0">
                  <p className="break-words text-xs font-medium text-text-primary">{userName}</p>
                  {session?.user.email && (
                    <p className="mt-0.5 break-words text-[11px] text-text-secondary">{session.user.email}</p>
                  )}
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={isSigningOut || isPending || !session}
                onSelect={(event) => {
                  event.preventDefault();
                  void handleSignOut();
                }}
                className="text-danger data-highlighted:bg-danger/10"
              >
                {isSigningOut ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  <LogOut className="size-4" aria-hidden="true" />
                )}
                {isSigningOut ? "Logging out..." : "Log out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
