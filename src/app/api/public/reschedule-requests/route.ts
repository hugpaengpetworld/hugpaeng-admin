import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { normalizePhone } from "@/domain/boarding/booking-input";
import { assertIsoDateRange } from "@/domain/boarding/date-range";
import {
  assertPublicPostRequest,
  createPublicFingerprint,
  publicApiErrorResponse,
} from "@/lib/http/public-api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z
  .object({
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
    newCheckInDate: z.string(),
    newCheckOutDate: z.string(),
    reason: z.string().trim().max(500).optional(),
  })
  .superRefine((input, context) => {
    try {
      assertIsoDateRange({
        startDate: input.newCheckInDate,
        endDate: input.newCheckOutDate,
      });
    } catch {
      context.addIssue({ code: "custom", message: "INVALID_DATE_RANGE" });
    }
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
        p_action: "PUBLIC_RESCHEDULE",
        p_fingerprint_hash: createPublicFingerprint(request),
        p_max_requests: 20,
      },
    );
    if (rateError) throw rateError;

    const { data, error } = await supabase.rpc("request_public_reschedule", {
      p_tenant_slug: tenantSlug,
      p_booking_code: input.data.bookingCode,
      p_phone: input.data.phone,
      p_new_check_in_date: input.data.newCheckInDate,
      p_new_check_out_date: input.data.newCheckOutDate,
      p_reason: input.data.reason ?? null,
    });
    if (error) throw error;
    return NextResponse.json(
      {
        ok: true,
        requestReference: data,
        message: "รับคำขอเลื่อนวันแล้ว กรุณารอคลินิกตรวจสอบห้องว่าง",
        requestId,
      },
      { status: 201 },
    );
  } catch (error) {
    return publicApiErrorResponse(error, requestId);
  }
}
