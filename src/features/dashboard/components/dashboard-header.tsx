import { QuickAdd } from "./quick-add";

export function DashboardHeader() {
    return (
        <section className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 md:flex md:flex-row md:items-end md:justify-between">
            <div>
                <p className="text-[10px] md:text-xs font-medium uppercase tracking-[0.14em] text-primary">
                    Tuesday, October 7
                </p>

                <h1 className="mt-1 md:mt-2 text-xl font-semibold tracking-tight text-text-primary md:text-3xl">
                    Good morning, Ganesh.
                </h1>

                <p className="hidden md:block mt-1 max-w-xl text-sm leading-6 text-text-secondary">
                    Here’s a quick look at how things are going across your life.
                </p>
            </div>

            <QuickAdd />
        </section>
    );
}
