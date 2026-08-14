import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTenantContext } from "@/data/auth/tenant-context";
import { assertIsoDateRange } from "@/domain/boarding/date-range";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const querySchema = z
  .object({
    species: z.enum(["CAT", "DOG"]),
    checkInDate: z.string(),
    checkOutDate: z.string(),
  })
  .superRefine((input, context) => {
    try {
      assertIsoDateRange({
        startDate: input.checkInDate,
        endDate: input.checkOutDate,
      });
    } catch {
      context.addIssue({ code: "custom", message: "INVALID_DATE_RANGE" });
    }
  });

export async function GET(request: Request) {
  const context = await requireTenantContext();
  const url = new URL(request.url);
  const input = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!input.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_eligible_rooms", {
    p_tenant_id: context.tenantId,
    p_species: input.data.species,
    p_check_in_date: input.data.checkInDate,
    p_check_out_date: input.data.checkOutDate,
    p_exclude_booking_id: null,
  });
  if (error) {
    return NextResponse.json({ error: "ROOM_LOOKUP_FAILED" }, { status: 409 });
  }
  return NextResponse.json({ rooms: data ?? [] });
}
