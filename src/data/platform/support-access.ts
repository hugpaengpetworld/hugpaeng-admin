import "server-only";

import {
  requirePlatformContext,
  requirePlatformOwner,
} from "@/data/auth/platform-context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PlatformTenant {
  readonly id: string;
  readonly slug: string;
  readonly thaiName: string;
  readonly status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
}

export interface SupportAgent {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string | null;
}

export interface SupportGrant {
  readonly id: string;
  readonly tenantId: string;
  readonly supportUserId: string;
  readonly reason: string;
  readonly ticketReference: string;
  readonly scopes: readonly string[];
  readonly startsAt: string;
  readonly expiresAt: string;
  readonly status: "SCHEDULED" | "ACTIVE" | "EXPIRED" | "REVOKED";
  readonly lastUsedAt: string | null;
}

export async function getPlatformSupportData(): Promise<{
  readonly tenants: readonly PlatformTenant[];
  readonly agents: readonly SupportAgent[];
  readonly grants: readonly SupportGrant[];
}> {
  const context = await requirePlatformContext();
  requirePlatformOwner(context);
  const supabase = await createSupabaseServerClient();
  const [tenantResult, roleResult, grantResult] = await Promise.all([
    supabase
      .from("tenants")
      .select("id, slug, thai_name, status")
      .order("thai_name"),
    supabase
      .from("platform_roles")
      .select("user_id")
      .eq("role", "SUPPORT_AGENT")
      .eq("is_active", true),
    supabase
      .from("support_access_grants")
      .select(
        "id, tenant_id, support_user_id, reason, ticket_reference, scopes, starts_at, expires_at, status, last_used_at",
      )
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (tenantResult.error || roleResult.error || grantResult.error)
    throw new Error("PLATFORM_DATA_UNAVAILABLE");

  const roleRows = (roleResult.data ?? []) as { readonly user_id: string }[];
  const admin = createSupabaseAdminClient();
  const agents = await Promise.all(
    roleRows.map(async ({ user_id }) => {
      const [profileResult, userResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name")
          .eq("user_id", user_id)
          .single(),
        admin.auth.admin.getUserById(user_id),
      ]);
      return {
        userId: user_id,
        displayName:
          (profileResult.data as { display_name?: string } | null)
            ?.display_name ?? "Support Agent",
        email: userResult.data.user?.email ?? null,
      };
    }),
  );
  return {
    tenants: (
      (tenantResult.data ?? []) as {
        id: string;
        slug: string;
        thai_name: string;
        status: PlatformTenant["status"];
      }[]
    ).map((row) => ({
      id: row.id,
      slug: row.slug,
      thaiName: row.thai_name,
      status: row.status,
    })),
    agents,
    grants: (
      (grantResult.data ?? []) as {
        id: string;
        tenant_id: string;
        support_user_id: string;
        reason: string;
        ticket_reference: string;
        scopes: string[];
        starts_at: string;
        expires_at: string;
        status: SupportGrant["status"];
        last_used_at: string | null;
      }[]
    ).map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      supportUserId: row.support_user_id,
      reason: row.reason,
      ticketReference: row.ticket_reference,
      scopes: row.scopes,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      status: row.status,
      lastUsedAt: row.last_used_at,
    })),
  };
}
