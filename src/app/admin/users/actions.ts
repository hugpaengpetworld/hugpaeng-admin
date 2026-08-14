"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  requireTenantContext,
  requireUserManager,
} from "@/data/auth/tenant-context";
import { clinicRoles, tenantPermissions } from "@/domain/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const inviteSchema = z.object({
  email: z.email(),
  displayName: z.string().trim().min(1).max(150),
  role: z.enum(clinicRoles),
  permissions: z.array(z.enum(tenantPermissions)),
});
const membershipSchema = z.object({
  membershipId: z.uuid(),
  role: z.enum(clinicRoles),
  status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]),
  permissions: z.array(z.enum(tenantPermissions)),
});

export async function inviteTenantUserAction(
  formData: FormData,
): Promise<void> {
  const context = await requireTenantContext();
  requireUserManager(context);
  const input = inviteSchema.safeParse({
    email: formData.get("email"),
    displayName: formData.get("displayName"),
    role: formData.get("role"),
    permissions: formData.getAll("permissions"),
  });
  if (!input.success) redirect("/admin/users?error=VALIDATION_ERROR");
  if (context.role === "ADMIN" && input.data.role === "OWNER") {
    redirect("/admin/users?error=ADMIN_CANNOT_MANAGE_OWNER");
  }
  const admin = createSupabaseAdminClient();
  const existingUserIds = await findUserIdsByEmail(admin, input.data.email);
  if (existingUserIds.length > 0) {
    const { data: existingMembership } = await admin
      .from("tenant_memberships")
      .select("id")
      .eq("tenant_id", context.tenantId)
      .in("user_id", existingUserIds)
      .limit(1)
      .maybeSingle();
    if (existingMembership) redirect("/admin/users?error=USER_ALREADY_MEMBER");
  }

  let userId = existingUserIds[0];
  let createdAuthUser = false;
  if (!userId) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(
      input.data.email,
      {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback`,
        data: { display_name: input.data.displayName },
      },
    );
    if (error || !data.user) redirect("/admin/users?error=INVITE_FAILED");
    userId = data.user.id;
    createdAuthUser = true;
  }
  const supabase = await createSupabaseServerClient();
  const { error: provisionError } = await supabase.rpc(
    "provision_tenant_member",
    {
      p_tenant_id: context.tenantId,
      p_user_id: userId,
      p_display_name: input.data.displayName,
      p_role: input.data.role,
      p_allowed_permissions: input.data.permissions,
    },
  );
  if (provisionError) {
    if (createdAuthUser) {
      await admin.auth.admin.deleteUser(userId);
    }
    const code = provisionError.message.includes("USER_ALREADY_MEMBER")
      ? "USER_ALREADY_MEMBER"
      : provisionError.message.includes("ADMIN_CANNOT_MANAGE_OWNER")
        ? "ADMIN_CANNOT_MANAGE_OWNER"
        : "INVITE_FAILED";
    redirect(`/admin/users?error=${code}`);
  }
  revalidatePath("/admin/users");
  redirect("/admin/users?success=invited");
}

export async function manageTenantMembershipAction(
  formData: FormData,
): Promise<void> {
  const context = await requireTenantContext();
  requireUserManager(context);
  const input = membershipSchema.safeParse({
    membershipId: formData.get("membershipId"),
    role: formData.get("role"),
    status: formData.get("status"),
    permissions: formData.getAll("permissions"),
  });
  if (!input.success) redirect("/admin/users?error=VALIDATION_ERROR");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(
    "manage_tenant_membership_with_permissions",
    {
      p_membership_id: input.data.membershipId,
      p_role: input.data.role,
      p_status: input.data.status,
      p_allowed_permissions: input.data.permissions,
    },
  );
  if (error) {
    const codes = [
      "CANNOT_CHANGE_OWN_MEMBERSHIP",
      "LAST_OWNER_REQUIRED",
      "FORBIDDEN",
      "ADMIN_CANNOT_MANAGE_OWNER",
      "UNKNOWN_PERMISSION",
    ] as const;
    const code =
      codes.find((item) => error.message.includes(item)) ?? "UNKNOWN";
    redirect(`/admin/users?error=${code}`);
  }
  revalidatePath("/admin/users");
  redirect("/admin/users?success=updated");
}

async function findUserIdsByEmail(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  email: string,
): Promise<string[]> {
  const ids: string[] = [];
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    // Fail closed: treating an Auth Admin API failure as "no existing user"
    // could create a duplicate invitation and provision the wrong identity.
    if (error) throw new Error("AUTH_USER_LOOKUP_FAILED");
    ids.push(
      ...data.users
        .filter((user) => user.email?.toLowerCase() === email.toLowerCase())
        .map((user) => user.id),
    );
    if (data.users.length < 200) break;
    page += 1;
  }
  return ids;
}
