"use client";

import { Moon, Sun } from "lucide-react";

import { IconButton } from "@/components/ui/icon-button";
import { useTheme } from "./use-theme";

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const dark = theme === "dark";

    return (
        <IconButton
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            aria-pressed={dark}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={(event) => {
                setTheme(dark ? "light" : "dark");
                if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                    event.currentTarget.querySelector<HTMLElement>("[data-theme-icon]")?.animate?.(
                        [
                            { transform: "rotate(-35deg) scale(0.75)" },
                            { transform: "rotate(0deg) scale(1)" },
                        ],
                        { duration: 220, easing: "ease-out" },
                    );
                }
            }}
        >
            <span data-theme-icon className="inline-flex size-4.25" aria-hidden="true">
                {dark ? <Moon className="size-full" /> : <Sun className="size-full" />}
            </span>
        </IconButton>
    );
}
