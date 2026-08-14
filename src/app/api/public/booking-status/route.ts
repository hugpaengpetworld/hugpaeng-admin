import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { normalizePhone } from "@/domain/boarding/booking-input";
import {
  assertPublicPostRequest,
  createPublicFingerprint,
  publicApiErrorResponse,
} from "@/lib/http/public-api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
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
  try {
    assertPublicPostRequest(request);
    const input = schema.safeParse(await request.json());
    if (!input.success) throw new Error("VALIDATION_ERROR");
    const supabase = createSupabaseAdminClient();
    const tenantSlug = process.env.DEFAULT_TENANT_SLUG ?? "baan-mhor-poy";
    const { error: rateError } = await supabase.rpc(
      "consume_public_rate_limit",
      {
        p_tenant_slug: tenantSlug,
        p_action: "PUBLIC_BOOKING_STATUS",
        p_fingerprint_hash: createPublicFingerprint(request),
        p_max_requests: 60,
      },
    );
    if (rateError) throw rateError;

    const { data, error } = await supabase.rpc("get_public_booking_status", {
      p_tenant_slug: tenantSlug,
      p_booking_code: input.data.bookingCode,
      p_phone: input.data.phone,
    });
    if (error) throw error;
    const result = data?.[0];
    if (!result) throw new Error("NOT_FOUND");
    return NextResponse.json({ ok: true, booking: result, requestId });
  } catch (error) {
    return publicApiErrorResponse(error, requestId);
  }
}
