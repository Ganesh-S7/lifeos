interface NavigationRoute {
    label: string;
    href: string;
    implemented: boolean;
    section: "workspace" | "manage" | null;
    parentHref?: string;
}

// Keep future destinations defined without advertising missing pages in the shell.
export const navigationRoutes: readonly NavigationRoute[] = [
    { label: "Overview", href: "/dashboard", implemented: true, section: "workspace" },
    { label: "Finance", href: "/finance", implemented: true, section: "workspace" },
    { label: "Health", href: "/health", implemented: true, section: "workspace" },
    {
        label: "Expenses",
        href: "/finance/expenses",
        parentHref: "/finance",
        implemented: true,
        section: null,
    },
    { label: "Goals", href: "/goals", implemented: false, section: "workspace" },
    { label: "Habits & Tasks", href: "/habits", implemented: false, section: "workspace" },
    { label: "Career", href: "/career", implemented: false, section: "workspace" },
    { label: "Settings", href: "/settings", implemented: false, section: "manage" },
];

export const sidebarNavigation = navigationRoutes.filter(
    (route) => route.implemented && route.section !== null,
);

function normalizePathname(pathname: string): string {
    return pathname.replace(/\/+$/, "") || "/";
}

export function isNavigationActive(pathname: string, href: string): boolean {
    const path = normalizePathname(pathname);
    return path === href || (href !== "/dashboard" && path.startsWith(`${href}/`));
}

export function resolveBreadcrumbs(pathname: string): NavigationRoute[] {
    const current = navigationRoutes.find(
        (route) => route.implemented && route.href === normalizePathname(pathname),
    );
    if (!current) {
        return [];
    }
    const parent = navigationRoutes.find(
        (route) => route.implemented && route.href === current.parentHref,
    );
    return parent ? [parent, current] : [current];
}
