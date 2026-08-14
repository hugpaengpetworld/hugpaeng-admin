import "server-only";

import { requireOwner, requireTenantContext } from "@/data/auth/tenant-context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface TenantUser {
  readonly membershipId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly role: "OWNER" | "DOCTOR" | "STAFF";
  readonly status: "INVITED" | "ACTIVE" | "SUSPENDED" | "REVOKED";
}

export async function listTenantUsers(): Promise<readonly TenantUser[]> {
  const context = await requireTenantContext();
  requireOwner(context);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tenant_memberships")
    .select("id, user_id, role, status")
    .eq("tenant_id", context.tenantId)
    .order("created_at");
  if (error) throw new Error("TENANT_USERS_UNAVAILABLE");
  const rows = (data ?? []) as {
    id: string;
    user_id: string;
    role: TenantUser["role"];
    status: TenantUser["status"];
  }[];
  const admin = createSupabaseAdminClient();
  return Promise.all(
    rows.map(async (row) => {
      const [profileResult, userResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name")
          .eq("user_id", row.user_id)
          .single(),
        admin.auth.admin.getUserById(row.user_id),
      ]);
      return {
        membershipId: row.id,
        userId: row.user_id,
        displayName:
          (profileResult.data as { display_name?: string } | null)
            ?.display_name ?? "ผู้ใช้งาน",
        email: userResult.data.user?.email ?? null,
        role: row.role,
        status: row.status,
      };
    }),
  );
}
