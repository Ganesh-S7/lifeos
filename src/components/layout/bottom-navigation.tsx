"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleDollarSign, HeartPulse, LayoutDashboard } from "lucide-react";
import { isNavigationActive, sidebarNavigation } from "@/lib/navigation";
import { cn } from "@/lib/utils/cn";

const icons = {
  "/dashboard": LayoutDashboard,
  "/finance": CircleDollarSign,
  "/health": HeartPulse,
};

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="mx-auto grid h-16 max-w-lg grid-cols-3 px-4">
        {sidebarNavigation.map((item) => {
          const Icon = icons[item.href as keyof typeof icons];
          const active = isNavigationActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "my-1 flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                active ? "bg-sidebar-active text-primary" : "text-text-secondary hover:bg-sidebar-hover",
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
