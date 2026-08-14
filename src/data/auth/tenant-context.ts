import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PromptPayTargetType } from "@/integrations/promptpay/payload";

export type ClinicRole = "OWNER" | "DOCTOR" | "STAFF";

export interface TenantContext {
  readonly userId: string;
  readonly displayName: string;
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly thaiName: string;
  readonly englishName: string;
  readonly role: ClinicRole;
  readonly logoStoragePath: string | null;
  readonly clinicAddress: string | null;
  readonly contactPhone: string | null;
  readonly receiptTaxEnabled: boolean;
  readonly receiptTaxHeading: string | null;
  readonly taxId: string | null;
  readonly branchNumber: string | null;
  readonly promptpayDisplayValue: string | null;
  readonly promptpayQrEnabled: boolean;
  readonly promptpayTargetType: PromptPayTargetType | null;
  readonly promptpayTargetValue: string | null;
  readonly promptpayPayeeName: string | null;
  readonly bankName: string | null;
  readonly bankAccountName: string | null;
  readonly bankAccountNumberMasked: string | null;
}

interface MembershipRow {
  readonly tenant_id: string;
  readonly role: ClinicRole;
}

interface TenantRow {
  readonly id: string;
  readonly slug: string;
  readonly thai_name: string;
  readonly english_name: string;
}

interface ProfileRow {
  readonly display_name: string;
}

interface SettingsRow {
  readonly logo_storage_path: string | null;
  readonly clinic_address: string | null;
  readonly contact_phone: string | null;
  readonly receipt_tax_enabled: boolean;
  readonly receipt_tax_heading: string | null;
  readonly tax_id: string | null;
  readonly branch_number: string | null;
  readonly promptpay_display_value: string | null;
  readonly promptpay_qr_enabled: boolean;
  readonly promptpay_target_type: PromptPayTargetType | null;
  readonly promptpay_target_value: string | null;
  readonly promptpay_payee_name: string | null;
  readonly bank_name: string | null;
  readonly bank_account_name: string | null;
  readonly bank_account_number_masked: string | null;
}

export const requireTenantContext = cache(async (): Promise<TenantContext> => {
  const supabase = await createSupabaseServerClient();
  const { data: claimData, error: claimError } =
    await supabase.auth.getClaims();
  const userId = claimData?.claims?.sub;
  if (claimError || !userId) redirect("/admin/login?reason=session");

  const { data: membershipData, error: membershipError } = await supabase
    .from("tenant_memberships")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const membership = membershipData as MembershipRow | null;
  if (membershipError || !membership) redirect("/unauthorized");

  const [tenantResult, profileResult, settingsResult] = await Promise.all([
    supabase
      .from("tenants")
      .select("id, slug, thai_name, english_name")
      .eq("id", membership.tenant_id)
      .single(),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .single(),
    supabase
      .from("tenant_settings")
      .select(
        "logo_storage_path, clinic_address, contact_phone, receipt_tax_enabled, receipt_tax_heading, tax_id, branch_number, promptpay_display_value, promptpay_qr_enabled, promptpay_target_type, promptpay_target_value, promptpay_payee_name, bank_name, bank_account_name, bank_account_number_masked",
      )
      .eq("tenant_id", membership.tenant_id)
      .maybeSingle(),
  ]);

  const tenant = tenantResult.data as TenantRow | null;
  const profile = profileResult.data as ProfileRow | null;
  const settings = settingsResult.data as SettingsRow | null;
  if (tenantResult.error || !tenant || profileResult.error || !profile) {
    redirect("/unauthorized");
  }

  return {
    userId,
    displayName: profile.display_name,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    thaiName: tenant.thai_name,
    englishName: tenant.english_name,
    role: membership.role,
    logoStoragePath: settings?.logo_storage_path ?? null,
    clinicAddress: settings?.clinic_address ?? null,
    contactPhone: settings?.contact_phone ?? null,
    receiptTaxEnabled: settings?.receipt_tax_enabled ?? false,
    receiptTaxHeading: settings?.receipt_tax_heading ?? null,
    taxId: settings?.tax_id ?? null,
    branchNumber: settings?.branch_number ?? null,
    promptpayDisplayValue: settings?.promptpay_display_value ?? null,
    promptpayQrEnabled: settings?.promptpay_qr_enabled ?? false,
    promptpayTargetType: settings?.promptpay_target_type ?? null,
    promptpayTargetValue: settings?.promptpay_target_value ?? null,
    promptpayPayeeName: settings?.promptpay_payee_name ?? null,
    bankName: settings?.bank_name ?? null,
    bankAccountName: settings?.bank_account_name ?? null,
    bankAccountNumberMasked: settings?.bank_account_number_masked ?? null,
  };
});

export function requireOwner(context: TenantContext): void {
  if (context.role !== "OWNER") redirect("/unauthorized");
}
