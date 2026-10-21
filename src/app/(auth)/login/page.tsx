"use client";

import { useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
    ArrowRight,
    LoaderCircle,
} from "lucide-react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Button, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

import {
    loginSchema,
    type LoginFormValues,
} from "@/features/auth/schemas/auth-schemas";

export default function LoginPage() {
    const router = useRouter();

    const [serverError, setServerError] = useState("");

    const {
        register,
        handleSubmit,
        formState: {
            errors,
            isSubmitting,
        },
    } = useForm<LoginFormValues>({
        resolver: zodResolver(loginSchema),

        defaultValues: {
            email: "",
            password: "",
        },

        mode: "onTouched",
        reValidateMode: "onChange",
    });

    async function onSubmit(values: LoginFormValues) {
        setServerError("");

        try {
            const { error } = await authClient.signIn.email({
                email: values.email.trim().toLowerCase(),
                password: values.password,
            });

            if (error) {
                setServerError(
                    "Unable to sign in. Check your email and password, then try again.",
                );

                return;
            }

            router.replace("/dashboard");
            router.refresh();
        } catch {
            setServerError(
                "Something went wrong. Please try again.",
            );
        }
    }

    return (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-lg shadow-black/5 sm:p-7">
            <div className="mb-7">
                <p className="text-sm font-medium text-primary">
                    WELCOME BACK
                </p>

                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
                    Sign in to LifeOS
                </h1>

                <p className="mt-2 text-sm leading-6 text-text-secondary">
                    Pick up where you left off.
                </p>
            </div>

            <form
                noValidate
                onSubmit={handleSubmit(onSubmit)}
                className="space-y-4"
                aria-busy={isSubmitting}
            >
                <Input
                    label="Email address"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    maxLength={254}
                    required
                    disabled={isSubmitting}
                    {...register("email")}
                    error={errors.email?.message}
                />

                <Input
                    label="Password"
                    type="password"
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    maxLength={128}
                    required
                    disabled={isSubmitting}
                    {...register("password")}
                    error={errors.password?.message}
                />

                {serverError && (
                    <div
                        role="alert"
                        aria-live="polite"
                        className="rounded-lg border border-danger/20 bg-danger-subtle p-3 text-sm text-danger"
                    >
                        {serverError}
                    </div>
                )}

                <Button
                    type="submit"
                    size="lg"
                    disabled={isSubmitting}
                    className="mt-2 w-full"
                >
                    {isSubmitting ? (
                        <>
                            <LoaderCircle
                                size={16}
                                className="animate-spin"
                                aria-hidden="true"
                            />

                            Signing in...
                        </>
                    ) : (
                        <>
                            Sign in

                            <ArrowRight
                                size={16}
                                aria-hidden="true"
                            />
                        </>
                    )}
                </Button>
            </form>

            <p className="mt-6 text-center text-sm text-text-secondary">
                Don&apos;t have an account?{" "}
                <Link
                    href="/signup"
                    className="font-medium text-primary hover:underline"
                >
                    Create one
                </Link>
            </p>
        </section>
    );
}