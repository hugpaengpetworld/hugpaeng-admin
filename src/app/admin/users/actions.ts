"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireOwner, requireTenantContext } from "@/data/auth/tenant-context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const inviteSchema = z.object({
  email: z.email(),
  displayName: z.string().trim().min(1).max(150),
  role: z.enum(["OWNER", "DOCTOR", "STAFF"]),
});
const membershipSchema = z.object({
  membershipId: z.uuid(),
  role: z.enum(["OWNER", "DOCTOR", "STAFF"]),
  status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]),
});

export async function inviteTenantUserAction(
  formData: FormData,
): Promise<void> {
  const context = await requireTenantContext();
  requireOwner(context);
  const input = inviteSchema.safeParse({
    email: formData.get("email"),
    displayName: formData.get("displayName"),
    role: formData.get("role"),
  });
  if (!input.success) redirect("/admin/users?error=VALIDATION_ERROR");
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
  }
  const supabase = await createSupabaseServerClient();
  const { error: provisionError } = await supabase.rpc(
    "provision_tenant_member",
    {
      p_tenant_id: context.tenantId,
      p_user_id: userId,
      p_display_name: input.data.displayName,
      p_role: input.data.role,
    },
  );
  if (provisionError) {
    const code = provisionError.message.includes("USER_ALREADY_MEMBER")
      ? "USER_ALREADY_MEMBER"
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
  requireOwner(context);
  const input = membershipSchema.safeParse({
    membershipId: formData.get("membershipId"),
    role: formData.get("role"),
    status: formData.get("status"),
  });
  if (!input.success) redirect("/admin/users?error=VALIDATION_ERROR");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("manage_tenant_membership", {
    p_membership_id: input.data.membershipId,
    p_role: input.data.role,
    p_status: input.data.status,
  });
  if (error) {
    const codes = [
      "CANNOT_CHANGE_OWN_MEMBERSHIP",
      "LAST_OWNER_REQUIRED",
      "FORBIDDEN",
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
    if (error) return ids;
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
