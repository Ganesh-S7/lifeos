import type { ReactNode } from "react";

import Link from "next/link";

import {
    Activity,
    HeartPulse,
    Sparkles,
    WalletCards,
} from "lucide-react";

interface AuthLayoutProps {
    children: ReactNode;
}

function BrandLogo() {
    return (
        <Link
            href="/"
            aria-label="LifeOS home"
            className="inline-flex w-fit items-center gap-3"
        >
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Activity
                    size={22}
                    strokeWidth={2.2}
                    aria-hidden="true"
                />
            </span>

            <span>
                <span className="block text-lg font-semibold tracking-tight text-text-primary">
                    LifeOS
                </span>

                <span className="block text-xs text-text-secondary">
                    Your personal operating system
                </span>
            </span>
        </Link>
    );
}

function ProductPreview() {
    return (
        <div className="mt-8 grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-2 lg:mt-10">
            {/* Finance preview */}
            <div className="rounded-2xl border border-border bg-surface/80 p-4 transition-colors hover:bg-surface-elevated">
                <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary">
                        <WalletCards
                            size={20}
                            aria-hidden="true"
                        />
                    </span>

                    <div>
                        <h3 className="text-sm font-semibold text-text-primary">
                            Finance
                        </h3>

                        <p className="text-xs text-text-secondary">
                            Know your numbers
                        </p>
                    </div>
                </div>

                <svg
                    viewBox="0 0 220 56"
                    fill="none"
                    className="mt-5 h-12 w-full"
                    role="img"
                    aria-label="Decorative financial trend illustration"
                >
                    <path
                        d="M2 47 C25 45 31 28 55 35 S89 44 109 24 S147 33 164 16 S199 20 218 5"
                        stroke="var(--brand)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                    />

                    <path
                        d="M2 47 C25 45 31 28 55 35 S89 44 109 24 S147 33 164 16 S199 20 218 5 V56 H2 Z"
                        fill="var(--brand)"
                        fillOpacity="0.09"
                    />
                </svg>
            </div>

            {/* Health preview */}
            <div className="rounded-2xl border border-border bg-surface/80 p-4 transition-colors hover:bg-surface-elevated">
                <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success-subtle text-success">
                        <HeartPulse
                            size={20}
                            aria-hidden="true"
                        />
                    </span>

                    <div>
                        <h3 className="text-sm font-semibold text-text-primary">
                            Health
                        </h3>

                        <p className="text-xs text-text-secondary">
                            Build healthy habits
                        </p>
                    </div>
                </div>

                <div
                    className="mt-5 flex h-12 items-end gap-2"
                    aria-hidden="true"
                >
                    {[35, 52, 42, 76, 60, 88, 70, 96, 77, 90].map(
                        (height, index) => (
                            <span
                                key={index}
                                className="flex-1 rounded-t-sm bg-success"
                                style={{
                                    height: `${height}%`,
                                    opacity: 0.35 + index * 0.065,
                                }}
                            />
                        ),
                    )}
                </div>
            </div>
        </div>
    );
}

export default function AuthLayout({
    children,
}: AuthLayoutProps) {
    return (
        <div className="min-h-screen bg-background text-text-primary lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            {/* Branding and illustration */}
            <aside className="relative isolate flex flex-col overflow-hidden border-b border-border bg-surface-subtle px-5 py-6 sm:px-8 lg:min-h-screen lg:border-b-0 lg:border-r lg:px-10 lg:py-9 xl:px-14">
                {/* Decorative brand accents */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -left-28 -top-28 size-80 rounded-full bg-primary/10 blur-3xl"
                />

                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-32 -right-20 size-80 rounded-full bg-primary/5 blur-3xl"
                />

                <div className="relative">
                    <BrandLogo />
                </div>

                <div className="relative mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-9 lg:py-12">
                    <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary">
                        <Sparkles
                            size={14}
                            className="text-primary"
                            aria-hidden="true"
                        />

                        A little more clarity, every day
                    </div>

                    <h2 className="mt-6 max-w-lg text-3xl font-semibold leading-tight tracking-tight text-text-primary sm:text-4xl xl:text-5xl">
                        Make room for{" "}
                        <span className="text-primary">
                            what matters.
                        </span>
                    </h2>

                    <p className="mt-4 max-w-md text-sm leading-7 text-text-secondary sm:text-base">
                        Bring your finances and well-being together.
                        Track your progress, understand your habits,
                        and make more intentional decisions.
                    </p>

                    <ProductPreview />
                </div>

                <footer className="relative text-xs text-text-secondary">
                    A calmer way to manage everyday life.
                </footer>
            </aside>

            {/* Form panel */}
            <main className="flex min-w-0 items-center justify-center px-4 py-8 sm:px-8 lg:min-h-screen lg:px-10 xl:px-14">
                <div className="w-full max-w-107.5">
                    {children}
                </div>
            </main>
        </div>
    );
}