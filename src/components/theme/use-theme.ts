"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

import {
    getServerTheme,
    getTheme,
    restoreThemePreference,
    setTheme,
    subscribeTheme,
} from "@/lib/theme";

export function useTheme() {
    const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);
    // The root Toaster also uses this hook, including on routes without a toggle.
    // Reapply before paint if development remounting reset the root class.
    useLayoutEffect(restoreThemePreference, []);
    return { theme, setTheme };
}
