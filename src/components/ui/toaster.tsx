"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
    return (
        <SonnerToaster
            className="lifeos-toaster"
            position="bottom-right"
            closeButton
            visibleToasts={3}
            gap={12}
            offset={24}
            mobileOffset={16}
            containerAriaLabel="Notifications"
            toastOptions={{
                closeButtonAriaLabel: "Dismiss notification",
                classNames: {
                    toast: "lifeos-toast",
                    title: "font-medium",
                    success: "[&_[data-icon]]:text-success",
                    error: "[&_[data-icon]]:text-danger",
                    warning: "[&_[data-icon]]:text-warning",
                    info: "[&_[data-icon]]:text-info",
                },
            }}
        />
    );
}
