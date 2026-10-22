"use client";

import { Moon, Sun } from "lucide-react";

import { IconButton } from "@/components/ui/icon-button";
import { useTheme } from "./use-theme";

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const dark = theme === "dark";

    return (
        <IconButton
            aria-label="Dark mode"
            aria-pressed={dark}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => setTheme(dark ? "light" : "dark")}
        >
            {dark ? (
                <Sun className="size-4.25" aria-hidden="true" />
            ) : (
                <Moon className="size-4.25" aria-hidden="true" />
            )}
        </IconButton>
    );
}
