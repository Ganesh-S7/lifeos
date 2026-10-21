"use client";

import { useState } from "react";
import { createFinanceMutation } from "../utils/finance-mutation";

export function useFinanceMutation() {
    const [isPending, setIsPending] = useState(false);
    const [mutation] = useState(() => createFinanceMutation(setIsPending));

    return { ...mutation, isPendingState: isPending };
}
