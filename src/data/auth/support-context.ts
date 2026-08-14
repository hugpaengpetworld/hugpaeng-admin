import "server-only";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SupportContext {
  readonly grantId: string;
  readonly tenantId: string;
  readonly tenantName: string;
  readonly supportUserId: string;
  readonly reason: string;
  readonly ticketReference: string;
  readonly scopes: readonly string[];
  readonly startsAt: string;
  readonly expiresAt: string;
}

export async function requireSupportContext(
  grantId: string,
): Promise<SupportContext> {
  const supabase = await createSupabaseServerClient();
  const { data: claimData } = await supabase.auth.getClaims();
  const userId = claimData?.claims?.sub;
  if (!userId) redirect("/admin/login?reason=session");
  const { data, error } = await supabase
    .from("support_access_grants")
    .select(
      "id, tenant_id, support_user_id, reason, ticket_reference, scopes, starts_at, expires_at, status",
    )
    .eq("id", grantId)
    .eq("support_user_id", userId)
    .maybeSingle();
  const grant = data as {
    id: string;
    tenant_id: string;
    support_user_id: string;
    reason: string;
    ticket_reference: string;
    scopes: string[];
    starts_at: string;
    expires_at: string;
    status: string;
  } | null;
  if (
    error ||
    !grant ||
    grant.status !== "ACTIVE" ||
    new Date(grant.starts_at) > new Date() ||
    new Date(grant.expires_at) <= new Date()
  )
    redirect("/unauthorized");
  const { error: useError } = await supabase.rpc("record_support_access_use", {
    p_grant_id: grant.id,
  });
  if (useError) redirect("/unauthorized");
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("thai_name")
    .eq("id", grant.tenant_id)
    .single();
  if (tenantError || !tenant) redirect("/unauthorized");
  return {
    grantId: grant.id,
    tenantId: grant.tenant_id,
    tenantName: (tenant as { thai_name: string }).thai_name,
    supportUserId: grant.support_user_id,
    reason: grant.reason,
    ticketReference: grant.ticket_reference,
    scopes: grant.scopes,
    startsAt: grant.starts_at,
    expiresAt: grant.expires_at,
  };
}
