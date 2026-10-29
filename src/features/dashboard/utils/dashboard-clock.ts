export function getDashboardGreeting(date: Date): string {
    const hour = date.getHours();
    if (hour >= 6 && hour < 12) return "Good morning";
    if (hour >= 12 && hour < 18) return "Good afternoon";
    return "Good evening";
}

export function formatDashboardDate(date: Date): string {
    return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
    }).format(date);
}

/** Local calendar arithmetic also respects timezone offsets and DST changes. */
export function nextDashboardClockChange(date: Date): Date {
    const next = new Date(date);
    const nextHour = [6, 12, 18, 24].find((hour) => hour > date.getHours())!;
    next.setHours(nextHour, 0, 0, 0);
    return next;
}

// A primitive snapshot stays referentially stable between display changes.
export function getDashboardClockSnapshot(): string {
    const now = new Date();
    return `${formatDashboardDate(now)}|${getDashboardGreeting(now)}`;
}

/** Neither the server nor the first hydration render assumes a user timezone. */
export function getServerDashboardClockSnapshot(): null {
    return null;
}

export function subscribeDashboardClock(onChange: () => void): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined;

    function refresh() {
        clearTimeout(timer);
        onChange();
        if (document.visibilityState === "hidden") return;

        const now = new Date();
        timer = setTimeout(refresh, nextDashboardClockChange(now).getTime() - now.getTime());
    }

    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
        clearTimeout(timer);
        window.removeEventListener("focus", refresh);
        document.removeEventListener("visibilitychange", refresh);
    };
}
