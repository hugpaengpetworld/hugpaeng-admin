import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PlatformRole = "PLATFORM_OWNER" | "SUPPORT_AGENT";

export interface PlatformContext {
  readonly userId: string;
  readonly displayName: string;
  readonly role: PlatformRole;
}

export const requirePlatformContext = cache(
  async (): Promise<PlatformContext> => {
    const supabase = await createSupabaseServerClient();
    const { data: claimData, error: claimError } =
      await supabase.auth.getClaims();
    const userId = claimData?.claims?.sub;
    if (claimError || !userId) redirect("/admin/login?reason=session");

    const [roleResult, profileResult] = await Promise.all([
      supabase
        .from("platform_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", userId)
        .single(),
    ]);
    const role = roleResult.data as { readonly role: PlatformRole } | null;
    const profile = profileResult.data as {
      readonly display_name: string;
    } | null;
    if (roleResult.error || !role || profileResult.error || !profile)
      redirect("/unauthorized");
    return { userId, displayName: profile.display_name, role: role.role };
  },
);

export function requirePlatformOwner(context: PlatformContext): void {
  if (context.role !== "PLATFORM_OWNER") redirect("/unauthorized");
}
