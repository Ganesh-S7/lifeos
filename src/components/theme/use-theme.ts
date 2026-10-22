"use client";

import { useSyncExternalStore } from "react";

import { getServerTheme, getTheme, setTheme, subscribeTheme } from "@/lib/theme";

export function useTheme() {
    const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);
    return { theme, setTheme };
}
