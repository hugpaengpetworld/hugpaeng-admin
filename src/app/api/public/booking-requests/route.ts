import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { publicBookingRequestSchema } from "@/domain/boarding/booking-input";
import {
  detectEvidenceFileType,
  MAX_EVIDENCE_SIZE_BYTES,
} from "@/domain/files/evidence";
import {
  assertPublicPostRequest,
  createPublicFingerprint,
  hashRequest,
  publicApiErrorResponse,
} from "@/lib/http/public-api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

interface InternalBookingResult {
  readonly status: string;
  readonly idempotencyReplay?: boolean;
  readonly bookings: readonly { readonly bookingCode: string }[];
}

interface VaccinationUpload {
  readonly petIndex: number;
  readonly file: File;
  readonly mimeType: string;
  readonly extension: string;
  readonly sha256: string;
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const uploadedPaths: string[] = [];
  try {
    assertPublicPostRequest(request, MAX_EVIDENCE_SIZE_BYTES * 2 + 1_000_000);
    const formData = await request.formData();
    const serialized = formData.get("payload");
    let raw: unknown;
    try {
      raw = typeof serialized === "string" ? JSON.parse(serialized) : null;
    } catch {
      raw = null;
    }
    const input = publicBookingRequestSchema.safeParse(raw);
    if (!input.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "VALIDATION_ERROR",
          message: "กรุณาตรวจสอบข้อมูลผู้ติดต่อ วันที่ และข้อมูลสัตว์",
          requestId,
        },
        { status: 400 },
      );
    }

    const tenantSlug = process.env.DEFAULT_TENANT_SLUG ?? "baan-mhor-poy";
    const supabase = createSupabaseAdminClient();
    const fingerprint = createPublicFingerprint(request);
    const uploads = await validateVaccinationUploads(
      formData,
      input.data.pets.length,
    );
    const requestHash = hashRequest({
      ...input.data,
      vaccinationEvidence: uploads.map(
        ({ petIndex, mimeType, sha256, file }) => ({
          petIndex,
          mimeType,
          sha256,
          sizeBytes: file.size,
        }),
      ),
    });
    const { error: uploadRateError } = await supabase.rpc(
      "consume_public_rate_limit",
      {
        p_tenant_slug: tenantSlug,
        p_action: "PUBLIC_BOOKING_UPLOAD",
        p_fingerprint_hash: fingerprint,
        p_max_requests: 10,
      },
    );
    if (uploadRateError) throw uploadRateError;
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", tenantSlug)
      .eq("status", "ACTIVE")
      .single();
    if (tenantError || !tenant) throw new Error("NOT_FOUND");

    const evidenceByPet = new Map<
      number,
      { storagePath: string; mimeType: string; sizeBytes: number }
    >();
    for (const upload of uploads) {
      const storagePath = `${tenant.id}/vaccination/${randomUUID()}.${upload.extension}`;
      const { error: uploadError } = await supabase.storage
        .from("tenant-assets")
        .upload(storagePath, upload.file, {
          contentType: upload.mimeType,
          cacheControl: "3600",
          upsert: false,
        });
      if (uploadError) throw new Error("INTEGRATION_TEMPORARILY_UNAVAILABLE");
      uploadedPaths.push(storagePath);
      evidenceByPet.set(upload.petIndex, {
        storagePath,
        mimeType: upload.mimeType,
        sizeBytes: upload.file.size,
      });
    }

    const pets = input.data.pets.map((pet, petIndex) => ({
      ...pet,
      vaccinationEvidence: evidenceByPet.get(petIndex),
    }));
    const { data, error } = await supabase.rpc(
      "create_public_booking_request",
      {
        p_tenant_slug: tenantSlug,
        p_idempotency_key: input.data.idempotencyKey,
        p_request_hash: requestHash,
        p_fingerprint_hash: fingerprint,
        p_customer_name: input.data.customerName,
        p_customer_phone: input.data.customerPhone,
        p_check_in_date: input.data.checkInDate,
        p_check_out_date: input.data.checkOutDate,
        p_species: input.data.species,
        p_pets: pets,
        p_customer_notes: input.data.customerNotes ?? null,
      },
    );
    if (error) throw error;
    const result = data as InternalBookingResult | null;
    const bookingCodes = result?.bookings.map(({ bookingCode }) => bookingCode);
    if (!bookingCodes?.length) throw new Error("NOT_FOUND");
    if (result?.idempotencyReplay && uploadedPaths.length > 0) {
      await supabase.storage.from("tenant-assets").remove(uploadedPaths);
      uploadedPaths.length = 0;
    }

    return NextResponse.json(
      {
        ok: true,
        bookingCodes,
        status: "PENDING_APPROVAL",
        message: "รับคำขอแล้ว กรุณารอคลินิกตรวจสอบและยืนยัน",
        requestId,
      },
      { status: 201 },
    );
  } catch (error) {
    if (uploadedPaths.length > 0) {
      await createSupabaseAdminClient()
        .storage.from("tenant-assets")
        .remove(uploadedPaths);
    }
    return publicApiErrorResponse(error, requestId);
  }
}

async function validateVaccinationUploads(
  formData: FormData,
  petCount: number,
): Promise<VaccinationUpload[]> {
  const uploads: VaccinationUpload[] = [];
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith("vaccination-") || !(value instanceof File)) continue;
    const petIndex = Number(name.slice("vaccination-".length));
    if (
      !Number.isInteger(petIndex) ||
      petIndex < 0 ||
      petIndex >= petCount ||
      value.size < 1 ||
      uploads.some((upload) => upload.petIndex === petIndex)
    ) {
      throw new Error("VALIDATION_ERROR");
    }
    const bytes = new Uint8Array(await value.arrayBuffer());
    const detected = detectEvidenceFileType({
      declaredMimeType: value.type,
      sizeBytes: value.size,
      header: bytes.slice(0, 16),
    });
    if (!detected) throw new Error("VALIDATION_ERROR");
    uploads.push({
      petIndex,
      file: value,
      mimeType: detected.mimeType,
      extension: detected.extension,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  return uploads.toSorted((left, right) => left.petIndex - right.petIndex);
}
