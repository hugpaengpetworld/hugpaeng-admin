import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { normalizePhone } from "@/domain/boarding/booking-input";
import {
  detectEvidenceFileType,
  MAX_EVIDENCE_SIZE_BYTES,
} from "@/domain/files/evidence";
import {
  assertPublicPostRequest,
  createPublicFingerprint,
  publicApiErrorResponse,
} from "@/lib/http/public-api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const fieldsSchema = z.object({
  bookingCode: z
    .string()
    .trim()
    .min(5)
    .max(80)
    .transform((value) => value.toUpperCase()),
  phone: z
    .string()
    .transform(normalizePhone)
    .pipe(z.string().regex(/^\+?[0-9]{8,15}$/)),
});

export async function POST(request: Request) {
  const requestId = randomUUID();
  let uploadedPath: string | null = null;
  try {
    assertPublicPostRequest(request, MAX_EVIDENCE_SIZE_BYTES + 1_000_000);
    const formData = await request.formData();
    const fields = fieldsSchema.safeParse({
      bookingCode: formData.get("bookingCode"),
      phone: formData.get("phone"),
    });
    const file = formData.get("evidence");
    if (!fields.success || !(file instanceof File) || file.size < 1) {
      throw new Error("VALIDATION_ERROR");
    }
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const detected = detectEvidenceFileType({
      declaredMimeType: file.type,
      sizeBytes: file.size,
      header,
    });
    if (!detected) throw new Error("VALIDATION_ERROR");

    const supabase = createSupabaseAdminClient();
    const tenantSlug = process.env.DEFAULT_TENANT_SLUG ?? "baan-mhor-poy";
    const { error: rateError } = await supabase.rpc(
      "consume_public_rate_limit",
      {
        p_tenant_slug: tenantSlug,
        p_action: "PUBLIC_DEPOSIT_EVIDENCE",
        p_fingerprint_hash: createPublicFingerprint(request),
        p_max_requests: 20,
      },
    );
    if (rateError) throw rateError;
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", tenantSlug)
      .single();
    if (tenantError || !tenant) throw new Error("NOT_FOUND");

    uploadedPath = `${tenant.id}/payment-evidence/${randomUUID()}.${detected.extension}`;
    const { error: uploadError } = await supabase.storage
      .from("tenant-assets")
      .upload(uploadedPath, file, {
        contentType: detected.mimeType,
        cacheControl: "3600",
        upsert: false,
      });
    if (uploadError) throw new Error("INTEGRATION_TEMPORARILY_UNAVAILABLE");

    const { error } = await supabase.rpc("submit_deposit_evidence", {
      p_tenant_slug: tenantSlug,
      p_booking_code: fields.data.bookingCode,
      p_phone: fields.data.phone,
      p_storage_path: uploadedPath,
      p_mime_type: detected.mimeType,
      p_size_bytes: file.size,
    });
    if (error) throw error;
    return NextResponse.json(
      {
        ok: true,
        message: "ส่งหลักฐานแล้ว กรุณารอเจ้าหน้าที่ตรวจสอบ",
        requestId,
      },
      { status: 201 },
    );
  } catch (error) {
    if (uploadedPath) {
      await createSupabaseAdminClient()
        .storage.from("tenant-assets")
        .remove([uploadedPath]);
    }
    return publicApiErrorResponse(error, requestId);
  }
}
