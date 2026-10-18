import { z } from "zod";

export const signUpSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(2, "Name must contain at least 2 characters.")
            .max(100, "Name cannot exceed 100 characters."),

        email: z
            .string()
            .trim()
            .email("Enter a valid email address.")
            .max(254, "Email address is too long."),

        password: z
            .string()
            .min(8, "Password must contain at least 8 characters.")
            .max(128, "Password cannot exceed 128 characters."),

        confirmPassword: z
            .string()
            .min(1, "Please confirm your password."),
    })
    .refine(
        ({ password, confirmPassword }) =>
            password === confirmPassword,
        {
            message: "Passwords do not match.",
            path: ["confirmPassword"],
        },
    );

export const loginSchema = z.object({
    email: z
        .string()
        .trim()
        .email("Enter a valid email address.")
        .max(254, "Email address is too long."),

    password: z
        .string()
        .min(1, "Please enter your password.")
        .max(128, "Password cannot exceed 128 characters."),
});

export type SignUpFormValues = z.infer<typeof signUpSchema>;

export type LoginFormValues = z.infer<typeof loginSchema>;