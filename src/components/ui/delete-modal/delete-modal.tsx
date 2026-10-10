"use client";

import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";

import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui";

export interface DeleteModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;

    title?: string;
    description: ReactNode;

    confirmText?: string;
    cancelText?: string;

    isLoading?: boolean;
}

export function DeleteModal({
    open,
    onOpenChange,
    onConfirm,
    title = "Delete item?",
    description,
    confirmText = "Delete",
    cancelText = "Cancel",
    isLoading = false,
}: DeleteModalProps) {
    const handleOpenChange = (nextOpen: boolean) => {
        // Prevent the dialog from closing while deletion is in progress.
        if (isLoading && !nextOpen) {
            return;
        }

        onOpenChange(nextOpen);
    };

    return (
        <Dialog
            open={open}
            onOpenChange={handleOpenChange}
        >
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>

                    <DialogDescription>
                        {description}
                    </DialogDescription>
                </DialogHeader>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => handleOpenChange(false)}
                        disabled={isLoading}
                    >
                        {cancelText}
                    </Button>

                    <Button
                        variant="danger"
                        onClick={onConfirm}
                        disabled={isLoading}
                    >
                        {isLoading
                            ? "Deleting..."
                            : confirmText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}