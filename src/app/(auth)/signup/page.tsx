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
    signUpSchema,
    type SignUpFormValues,
} from "@/features/auth/schemas/auth-schemas";

export default function SignUpPage() {
    const router = useRouter();

    const [serverError, setServerError] = useState("");

    const {
        register,
        handleSubmit,
        formState: {
            errors,
            isSubmitting,
        },
    } = useForm<SignUpFormValues>({
        resolver: zodResolver(signUpSchema),

        defaultValues: {
            name: "",
            email: "",
            password: "",
            confirmPassword: "",
        },

        mode: "onTouched",
        reValidateMode: "onChange",
    });

    async function onSubmit(values: SignUpFormValues) {
        setServerError("");

        try {
            const { error } = await authClient.signUp.email({
                name: values.name.trim(),
                email: values.email.trim().toLowerCase(),
                password: values.password,
            });

            if (error) {
                setServerError(
                    error.message ||
                    "Unable to create your account. Please try again.",
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
            <div className="mb-6">
                <p className="text-sm font-medium text-primary">
                    GET STARTED
                </p>

                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
                    Create your account
                </h1>

                <p className="mt-2 text-sm leading-6 text-text-secondary">
                    Your finances and well-being, together in
                    one place.
                </p>
            </div>

            <form
                noValidate
                onSubmit={handleSubmit(onSubmit)}
                className="space-y-4"
                aria-busy={isSubmitting}
            >
                <Input
                    label="Full name"
                    type="text"
                    placeholder="Enter your name"
                    autoComplete="name"
                    maxLength={100}
                    required
                    disabled={isSubmitting}
                    {...register("name")}
                    error={errors.name?.message}
                />

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
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    maxLength={128}
                    required
                    disabled={isSubmitting}
                    {...register("password")}
                    error={errors.password?.message}
                />

                <Input
                    label="Confirm password"
                    type="password"
                    placeholder="Enter your password again"
                    autoComplete="new-password"
                    maxLength={128}
                    required
                    disabled={isSubmitting}
                    {...register("confirmPassword")}
                    error={errors.confirmPassword?.message}
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

                            Creating account...
                        </>
                    ) : (
                        <>
                            Create account

                            <ArrowRight
                                size={16}
                                aria-hidden="true"
                            />
                        </>
                    )}
                </Button>
            </form>

            <p className="mt-6 text-center text-sm text-text-secondary">
                Already have an account?{" "}
                <Link
                    href="/login"
                    className="font-medium text-primary hover:underline"
                >
                    Sign in
                </Link>
            </p>
        </section>
    );
}