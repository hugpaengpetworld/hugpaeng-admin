import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface PublicBranding {
  readonly thaiName: string;
  readonly englishName: string;
  readonly logoUrl: string | null;
}

const fallbackBranding: PublicBranding = {
  thaiName: "คลินิกบ้านหมอปอยรักษาสัตว์",
  englishName: "Baan Mhor Poy Vet Clinic",
  logoUrl: null,
};

interface TenantBrandingRow {
  readonly id: string;
  readonly thai_name: string;
  readonly english_name: string;
}

interface TenantSettingsRow {
  readonly logo_storage_path: string | null;
}

export async function getPublicBranding(): Promise<PublicBranding> {
  try {
    const supabase = createSupabaseAdminClient();
    const slug = process.env.DEFAULT_TENANT_SLUG ?? "baan-mhor-poy";
    const { data: tenantData, error: tenantError } = await supabase
      .from("tenants")
      .select("id, thai_name, english_name")
      .eq("slug", slug)
      .eq("status", "ACTIVE")
      .single();
    const tenant = tenantData as TenantBrandingRow | null;
    if (tenantError || !tenant) return fallbackBranding;

    const { data: settingsData } = await supabase
      .from("tenant_settings")
      .select("logo_storage_path")
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    const settings = settingsData as TenantSettingsRow | null;
    let logoUrl: string | null = null;
    if (settings?.logo_storage_path) {
      const { data } = await supabase.storage
        .from("tenant-assets")
        .createSignedUrl(settings.logo_storage_path, 15 * 60);
      logoUrl = data?.signedUrl ?? null;
    }

    return {
      thaiName: tenant.thai_name,
      englishName: tenant.english_name,
      logoUrl,
    };
  } catch {
    return fallbackBranding;
  }
}
