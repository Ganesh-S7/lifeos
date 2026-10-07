import { Plus } from "lucide-react";
import { Button } from "@/components/ui";

export function DashboardHeader() {
    return (
        <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">
                    Tuesday, October 7
                </p>

                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
                    Good morning, Ganesh.
                </h1>

                <p className="mt-1 max-w-xl text-sm leading-6 text-text-secondary">
                    Here’s a quick look at how things are going across your life.
                </p>
            </div>

            <Button>
                <Plus className="size-4" />
                Quick add
            </Button>
        </section>
    );
}