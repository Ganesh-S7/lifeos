"use client";

import { toast, type ExternalToast } from "sonner";

type NotificationOptions = Pick<
    ExternalToast,
    "description" | "action" | "id" | "duration"
>;

/** Call at the user-action boundary, after an awaited mutation completes. */
export const notify = {
    success(message: string, options?: NotificationOptions) {
        return toast.success(message, { duration: 4000, ...options });
    },
    error(message: string, options?: NotificationOptions) {
        return toast.error(message, { duration: 8000, ...options });
    },
    warning(message: string, options?: NotificationOptions) {
        return toast.warning(message, { duration: 6000, ...options });
    },
    info(message: string, options?: NotificationOptions) {
        return toast.info(message, { duration: 5000, ...options });
    },
};
