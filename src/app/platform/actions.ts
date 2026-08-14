"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  requirePlatformContext,
  requirePlatformOwner,
} from "@/data/auth/platform-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const allowedScopes = [
  "TENANT_OVERVIEW",
  "BOOKING_READ",
  "CUSTOMER_READ",
  "ROOM_READ",
  "FINANCE_READ",
  "STERILIZATION_READ",
  "HEALTH_READ",
  "AUDIT_READ",
] as const;

const createGrantSchema = z.object({
  tenantId: z.uuid(),
  supportUserId: z.uuid(),
  reason: z.string().trim().min(10).max(500),
  ticketReference: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(allowedScopes)).min(1),
  startLocal: z.string().optional(),
  durationHours: z.coerce.number().int().min(1).max(24),
});

export async function createSupportGrantAction(
  formData: FormData,
): Promise<void> {
  const context = await requirePlatformContext();
  requirePlatformOwner(context);
  const scopes = ["TENANT_OVERVIEW", ...formData.getAll("scopes").map(String)];
  const input = createGrantSchema.safeParse({
    tenantId: formData.get("tenantId"),
    supportUserId: formData.get("supportUserId"),
    reason: formData.get("reason"),
    ticketReference: formData.get("ticketReference"),
    scopes: [...new Set(scopes)],
    startLocal: formData.get("startLocal") || undefined,
    durationHours: formData.get("durationHours"),
  });
  if (!input.success) redirect("/platform?error=VALIDATION_ERROR");
  const startsAt = input.data.startLocal
    ? new Date(`${input.data.startLocal}:00+07:00`)
    : new Date();
  if (Number.isNaN(startsAt.getTime()))
    redirect("/platform?error=VALIDATION_ERROR");
  const expiresAt = new Date(
    startsAt.getTime() + input.data.durationHours * 60 * 60 * 1000,
  );
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_support_access_grant", {
    p_tenant_id: input.data.tenantId,
    p_support_user_id: input.data.supportUserId,
    p_reason: input.data.reason,
    p_ticket_reference: input.data.ticketReference,
    p_scopes: input.data.scopes,
    p_starts_at: startsAt.toISOString(),
    p_expires_at: expiresAt.toISOString(),
  });
  if (error) redirect(`/platform?error=${safeSupportError(error.message)}`);
  revalidatePath("/platform");
  redirect("/platform?success=grant_created");
}

export async function revokeSupportGrantAction(
  formData: FormData,
): Promise<void> {
  const context = await requirePlatformContext();
  requirePlatformOwner(context);
  const grantId = z.uuid().safeParse(formData.get("grantId"));
  const reason = z
    .string()
    .trim()
    .min(1)
    .max(500)
    .safeParse(formData.get("reason"));
  if (!grantId.success || !reason.success)
    redirect("/platform?error=VALIDATION_ERROR");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_support_access_grant", {
    p_grant_id: grantId.data,
    p_reason: reason.data,
  });
  if (error) redirect(`/platform?error=${safeSupportError(error.message)}`);
  revalidatePath("/platform");
  redirect("/platform?success=grant_revoked");
}

function safeSupportError(message: string): string {
  const codes = [
    "FORBIDDEN",
    "SUPPORT_AGENT_REQUIRED",
    "INVALID_SUPPORT_WINDOW",
    "SUPPORT_REASON_REQUIRED",
    "TICKET_REFERENCE_REQUIRED",
    "INVALID_SUPPORT_SCOPE",
    "SUPPORT_GRANT_NOT_ACTIVE",
    "REASON_REQUIRED",
  ] as const;
  return codes.find((code) => message.includes(code)) ?? "UNKNOWN";
}
