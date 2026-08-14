import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { availabilitySearchSchema } from "@/domain/boarding/booking-input";
import {
  assertPublicPostRequest,
  createPublicFingerprint,
  publicApiErrorResponse,
} from "@/lib/http/public-api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    assertPublicPostRequest(request);
    const input = availabilitySearchSchema.safeParse(await request.json());
    if (!input.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "VALIDATION_ERROR",
          message: "กรุณาตรวจสอบวันที่ จำนวนสัตว์ และน้ำหนัก",
          requestId,
        },
        { status: 400 },
      );
    }

    const tenantSlug = process.env.DEFAULT_TENANT_SLUG ?? "baan-mhor-poy";
    const supabase = createSupabaseAdminClient();
    const fingerprint = createPublicFingerprint(request);
    const { error: rateLimitError } = await supabase.rpc(
      "consume_public_rate_limit",
      {
        p_tenant_slug: tenantSlug,
        p_action: "PUBLIC_AVAILABILITY",
        p_fingerprint_hash: fingerprint,
        p_max_requests: 60,
      },
    );
    if (rateLimitError) throw rateLimitError;

    const { data, error } = await supabase.rpc("get_public_availability", {
      p_tenant_slug: tenantSlug,
      p_species: input.data.species,
      p_animal_count: input.data.pets.length,
      p_weights_kg: input.data.pets.map(({ weightKg }) => weightKg),
      p_check_in_date: input.data.checkInDate,
      p_check_out_date: input.data.checkOutDate,
    });
    if (error) throw error;
    const result = data?.[0];
    if (!result) throw new Error("NOT_FOUND");

    return NextResponse.json({
      ok: true,
      availableCount: result.available_count,
      nights: result.nights,
      nightlyRateSatang: result.nightly_rate_satang,
      lodgingTotalSatang: result.lodging_total_satang,
      requestId,
    });
  } catch (error) {
    return publicApiErrorResponse(error, requestId);
  }
}
