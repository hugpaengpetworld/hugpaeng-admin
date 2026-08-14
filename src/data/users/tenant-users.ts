import "server-only";

import {
  requireTenantContext,
  requireUserManager,
} from "@/data/auth/tenant-context";
import type { ClinicRole, TenantPermission } from "@/domain/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface TenantUser {
  readonly membershipId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly role: ClinicRole;
  readonly status: "INVITED" | "ACTIVE" | "SUSPENDED" | "REVOKED";
  readonly allowedPermissions: readonly TenantPermission[];
}

export interface PermissionOption {
  readonly code: TenantPermission;
  readonly label: string;
  readonly description: string;
}

export async function listTenantUsers(): Promise<readonly TenantUser[]> {
  const context = await requireTenantContext();
  requireUserManager(context);
  const supabase = await createSupabaseServerClient();
  const [membershipsResult, defaultsResult, overridesResult] =
    await Promise.all([
      supabase
        .from("tenant_memberships")
        .select("id, user_id, role, status")
        .eq("tenant_id", context.tenantId)
        .order("created_at"),
      supabase
        .from("tenant_role_permission_defaults")
        .select("role, permission_code, is_allowed")
        .eq("is_allowed", true),
      supabase
        .from("tenant_membership_permission_overrides")
        .select("membership_id, permission_code, is_allowed")
        .eq("tenant_id", context.tenantId),
    ]);
  if (
    membershipsResult.error ||
    defaultsResult.error ||
    overridesResult.error
  ) {
    throw new Error("TENANT_USERS_UNAVAILABLE");
  }
  const data = membershipsResult.data;
  const rows = (data ?? []) as {
    id: string;
    user_id: string;
    role: TenantUser["role"];
    status: TenantUser["status"];
  }[];
  const admin = createSupabaseAdminClient();
  const defaults = new Map<ClinicRole, TenantPermission[]>();
  for (const row of defaultsResult.data ?? []) {
    const role = row.role as ClinicRole;
    const current = defaults.get(role) ?? [];
    current.push(row.permission_code as TenantPermission);
    defaults.set(role, current);
  }
  const overrides = new Map<string, TenantPermission[]>();
  for (const row of overridesResult.data ?? []) {
    if (!row.is_allowed) continue;
    const current = overrides.get(row.membership_id) ?? [];
    current.push(row.permission_code as TenantPermission);
    overrides.set(row.membership_id, current);
  }
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
        allowedPermissions:
          row.role === "OWNER" || row.role === "ADMIN"
            ? context.permissions
            : (overrides.get(row.id) ?? defaults.get(row.role) ?? []),
      };
    }),
  );
}

export async function listPermissionOptions(): Promise<
  readonly PermissionOption[]
> {
  const context = await requireTenantContext();
  requireUserManager(context);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("permission_catalog")
    .select("code, thai_label, description")
    .neq("code", "USERS_MANAGE")
    .order("sort_order");
  if (error) throw new Error("PERMISSIONS_UNAVAILABLE");
  return (data ?? []).map((row) => ({
    code: row.code as TenantPermission,
    label: row.thai_label,
    description: row.description,
  }));
}
