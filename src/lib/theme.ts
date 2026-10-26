export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "lifeos.theme";

export function parseTheme(value: unknown): Theme {
    return value === "dark" ? "dark" : "light";
}

// Fixed, trusted script runs during HTML parsing, before application hydration.
// Keep storage access guarded for private browsing and restricted environments.
export const THEME_INIT_SCRIPT = `(() => {
    let theme = "light";
    try {
        theme = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}) === "dark" ? "dark" : "light";
    } catch {}
    document.documentElement.classList.toggle("dark", theme === "dark");
})();`;

const listeners = new Set<() => void>();

export function getTheme(): Theme {
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

// Match the server markup on the first hydration render, then read the DOM.
export function getServerTheme(): Theme {
    return "light";
}

function applyTheme(theme: Theme) {
    document.documentElement.classList.toggle("dark", theme === "dark");
    listeners.forEach((listener) => listener());
}

/** Repair root attributes after a remount without creating another theme store. */
export function restoreThemePreference() {
    let theme: Theme;
    try {
        theme = parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
    } catch {
        // Keep the current in-page choice when storage is unavailable.
        return;
    }
    if (getTheme() !== theme) applyTheme(theme);
}

export function setTheme(theme: Theme) {
    try {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
        // A storage failure must not prevent changing the current page's theme.
    }
    applyTheme(theme);
}

function handleStorage(event: StorageEvent) {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
        applyTheme(parseTheme(event.newValue));
    }
}

export function subscribeTheme(listener: () => void): () => void {
    if (listeners.size === 0) {
        window.addEventListener("storage", handleStorage);
    }
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
            window.removeEventListener("storage", handleStorage);
        }
    };
}
