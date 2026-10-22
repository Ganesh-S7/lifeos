"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    BarChart3,
    CircleDollarSign,
    HeartPulse,
    LayoutDashboard,
} from "lucide-react";
import { isNavigationActive, sidebarNavigation } from "@/lib/navigation";
import { cn } from "@/lib/utils/cn";
import { authClient } from "@/lib/auth-client";
import { Skeleton } from "@/components/ui";

const navigationIcons = {
    "/dashboard": LayoutDashboard,
    "/finance": CircleDollarSign,
    "/health": HeartPulse,
};

interface SidebarProps {
    open: boolean;
    onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
    const pathname = usePathname();

    const { data: session, isPending } = authClient.useSession();

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

    return (
        <>
            {open && (
                <button
                    aria-label="Close sidebar"
                    onClick={onClose}
                    className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] lg:hidden"
                />
            )}

            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-50 flex w-62 flex-col",
                    "border-r border-border-subtle bg-surface-subtle",
                    "transition-transform duration-200 ease-out",
                    open ? "translate-x-0" : "-translate-x-full",
                    "lg:translate-x-0"
                )}
            >
                {/* Brand */}
                <div className="flex h-16 items-center px-5">
                    <Link
                        href="/dashboard"
                        onClick={onClose}
                        className="flex items-center gap-3"
                    >
                        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                            <BarChart3 className="size-4" strokeWidth={2.25} />
                        </div>

                        <div className="leading-none">
                            <p className="text-[15px] font-semibold tracking-tight text-text-primary">
                                LifeOS
                            </p>

                            <p className="mt-1 text-[10px] text-text-muted">
                                Personal operating system
                            </p>
                        </div>
                    </Link>
                </div>

                {/* Navigation */}
                <nav
                    aria-label="Main navigation"
                    className="flex-1 overflow-y-auto px-3 pt-6"
                >
                    <p className="px-2.5 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                        Workspace
                    </p>

                    <div className="space-y-0.5">
                        {sidebarNavigation.map((item) => {
                            const Icon = navigationIcons[item.href as keyof typeof navigationIcons];

                            const active = isNavigationActive(pathname, item.href);

                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={onClose}
                                    aria-current={active ? "page" : undefined}
                                    className={cn(
                                        "group flex h-9 items-center gap-3 rounded-md px-2.5 text-[13px] font-medium",
                                        "transition-colors",
                                        active
                                            ? "bg-primary-subtle text-text-primary"
                                            : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
                                    )}
                                >
                                    <Icon
                                        className={cn(
                                            "size-4",
                                            active
                                                ? "text-primary"
                                                : "text-text-muted group-hover:text-text-secondary"
                                        )}
                                        strokeWidth={1.9}
                                    />

                                    <span>{item.label}</span>
                                </Link>
                            );
                        })}
                    </div>
                </nav>

                {/* Footer */}
                <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                        {initials}
                    </div>

                    <div className="min-w-0">
                        {initialSessionLoading ? (
                            <Skeleton variant="text" className="w-24" />
                        ) : (
                            <p className="truncate text-xs font-medium text-text-primary">
                                {userName}
                            </p>
                        )}

                        <p className="truncate text-[10px] text-text-muted">
                            {session?.user.email ?? "Personal account"}
                        </p>
                    </div>
                </div>
            </aside>
        </>
    );
}
