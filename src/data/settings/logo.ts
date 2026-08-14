import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getSignedLogoUrl(
  storagePath: string | null,
): Promise<string | null> {
  if (!storagePath) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from("tenant-assets")
    .createSignedUrl(storagePath, 15 * 60);
  return error ? null : data.signedUrl;
}
