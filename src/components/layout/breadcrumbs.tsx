"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { resolveBreadcrumbs } from "@/lib/navigation";

export function Breadcrumbs() {
    const items = resolveBreadcrumbs(usePathname());
    if (!items.length) {
        return null;
    }

    return (
        <nav
            aria-label="Breadcrumb"
            className="hidden min-w-0 items-center gap-2 text-xs text-text-muted sm:flex"
        >
            <span aria-hidden="true">LifeOS</span>
            <span aria-hidden="true">/</span>
            <ol className="flex min-w-0 items-center gap-2">
                {items.map((item, index) => (
                    <li key={item.href} className="flex min-w-0 items-center gap-2">
                        {index > 0 && <span aria-hidden="true">/</span>}
                        {index === items.length - 1 ? (
                            <span aria-current="page" className="truncate text-text-secondary">
                                {item.label}
                            </span>
                        ) : (
                            <Link
                                href={item.href}
                                className="truncate rounded-sm hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                            >
                                {item.label}
                            </Link>
                        )}
                    </li>
                ))}
            </ol>
        </nav>
    );
}
