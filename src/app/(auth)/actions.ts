"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { classifyPasswordRecoveryFailure } from "@/domain/auth/password-recovery";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const passwordSchema = z
  .object({
    password: z.string().min(12).max(128),
    confirmPassword: z.string(),
  })
  .refine(({ password, confirmPassword }) => password === confirmPassword);

const recoverySchema = z.object({
  email: z.email(),
});

export async function loginAction(formData: FormData): Promise<void> {
  const input = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!input.success) redirect("/admin/login?error=invalid_input");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(input.data);
  if (error) redirect("/admin/login?error=invalid_credentials");
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/admin/login?signed_out=1");
}

export async function requestPasswordResetAction(
  formData: FormData,
): Promise<void> {
  const input = recoverySchema.safeParse({ email: formData.get("email") });
  if (!input.success) redirect("/auth/forgot-password?error=invalid_email");

  const supabase = await createSupabaseServerClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(
    input.data.email,
    {
      redirectTo: `${appUrl}/auth/callback?next=/auth/set-password`,
    },
  );

  if (error) {
    const reason = classifyPasswordRecoveryFailure(error);
    redirect(`/auth/forgot-password?error=${reason}`);
  }

  // Keep the response identical for existing and unknown emails.
  redirect("/admin/login?recovery_sent=1");
}

export async function setPasswordAction(formData: FormData): Promise<void> {
  const input = passwordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!input.success) redirect("/auth/set-password?error=invalid_password");

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/admin/login?reason=session");
  const { error } = await supabase.auth.updateUser({
    password: input.data.password,
  });
  if (error) redirect("/auth/set-password?error=update_failed");
  redirect("/admin?password_updated=1");
}
