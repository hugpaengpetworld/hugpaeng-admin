"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  requirePermission,
  requireTenantContext,
} from "@/data/auth/tenant-context";
import { backOfficeBookingSchema } from "@/domain/boarding/booking-input";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const safeErrors = [
  "ROOM_UNAVAILABLE",
  "ROOM_SPECIES_MISMATCH",
  "INVALID_DOG_WEIGHT",
  "CAPACITY_EXCEEDED",
  "LINE_ID_REQUIRED",
  "CUSTOM_NIGHTLY_RATE_INVALID",
  "LINE_DEPOSIT_REQUIRED",
  "ROOM_NOT_READY",
  "OPEN_STAY_EXISTS",
  "IDEMPOTENCY_CONFLICT",
] as const;

export async function createBackOfficeBookingAction(
  formData: FormData,
): Promise<void> {
  const context = await requireTenantContext();
  const submittedIntent = formData.get("intent");
  const intent = submittedIntent === "check_in" ? "check_in" : "request";
  requirePermission(
    context,
    intent === "check_in" ? "CHECK_IN" : "BOOKINGS_WRITE",
  );
  const serialized = formData.get("payload");
  let raw: unknown;
  try {
    raw = typeof serialized === "string" ? JSON.parse(serialized) : null;
  } catch {
    redirect(
      intent === "check_in"
        ? "/admin/operations?error=VALIDATION_ERROR"
        : "/admin/bookings/new?error=VALIDATION_ERROR",
    );
  }
  const input = backOfficeBookingSchema.safeParse(raw);
  if (!input.success) {
    redirect(
      intent === "check_in"
        ? "/admin/operations?error=VALIDATION_ERROR"
        : "/admin/bookings/new?error=VALIDATION_ERROR",
    );
  }

  const supabase = await createSupabaseServerClient();
  const commonArguments = {
    p_tenant_id: context.tenantId,
    p_customer_name: input.data.customerName,
    p_customer_phone: input.data.customerPhone,
    p_line_user_id: input.data.lineUserId ?? null,
    p_channel: input.data.channel,
    p_check_in_date: input.data.checkInDate,
    p_check_out_date: input.data.checkOutDate,
    p_customer_notes: input.data.customerNotes ?? null,
    p_units: input.data.units,
  };
  if (intent === "check_in" && input.data.customerId) {
    redirect("/admin/bookings/new?error=REGISTRY_DIRECT_CHECKIN_UNSUPPORTED");
  }
  const { error } =
    intent === "check_in"
      ? await supabase.rpc("create_and_check_in_back_office_booking", {
          ...commonArguments,
          p_deposit_satang: input.data.depositSatang,
          p_idempotency_key: input.data.idempotencyKey,
        })
      : input.data.customerId
        ? await supabase.rpc("create_registry_priced_back_office_booking", {
            p_tenant_id: context.tenantId,
            p_customer_id: input.data.customerId,
            p_line_user_id: input.data.lineUserId ?? null,
            p_channel: input.data.channel,
            p_check_in_date: input.data.checkInDate,
            p_check_out_date: input.data.checkOutDate,
            p_customer_notes: input.data.customerNotes ?? null,
            p_units: input.data.units,
          })
        : await supabase.rpc(
            "create_priced_back_office_booking",
            commonArguments,
          );
  if (error) {
    const code = safeErrors.find((item) => error.message.includes(item));
    redirect(
      intent === "check_in"
        ? `/admin/operations?error=${code ?? "UNKNOWN"}`
        : `/admin/bookings/new?error=${code ?? "UNKNOWN"}`,
    );
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/operations");
  revalidatePath("/admin/rooms/cats");
  revalidatePath("/admin/rooms/dogs");
  redirect(
    intent === "check_in"
      ? "/admin/operations?success=checked_in"
      : "/admin/bookings?success=created",
  );
}

export async function reviewBookingAction(formData: FormData): Promise<void> {
  const context = await requireTenantContext();
  requirePermission(context, "BOOKINGS_WRITE");
  const bookingId = formData.get("bookingId");
  const decision = formData.get("decision");
  const reason = formData.get("reason");
  const expectedVersion = Number(formData.get("expectedVersion"));
  if (
    typeof bookingId !== "string" ||
    (decision !== "APPROVE" && decision !== "REJECT") ||
    typeof reason !== "string" ||
    !Number.isInteger(expectedVersion)
  ) {
    redirect("/admin/bookings?error=VALIDATION_ERROR");
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_booking", {
    p_booking_id: bookingId,
    p_decision: decision,
    p_reason: reason,
    p_expected_version: expectedVersion,
  });
  if (error) redirectWithSafeBookingError(error.message);
  revalidatePath("/admin/bookings");
  redirect(
    `/admin/bookings?success=${decision === "APPROVE" ? "approved" : "rejected"}`,
  );
}

export async function verifyDepositAction(formData: FormData): Promise<void> {
  const context = await requireTenantContext();
  requirePermission(context, "PAYMENTS_VERIFY");
  const paymentId = formData.get("paymentId");
  const expectedVersion = Number(formData.get("expectedVersion"));
  if (typeof paymentId !== "string" || !Number.isInteger(expectedVersion)) {
    redirect("/admin/bookings?error=VALIDATION_ERROR");
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("verify_deposit", {
    p_payment_id: paymentId,
    p_expected_booking_version: expectedVersion,
  });
  if (error) redirectWithSafeBookingError(error.message);
  revalidatePath("/admin/bookings");
  redirect("/admin/bookings?success=deposit_verified");
}

export async function decideRescheduleAction(
  formData: FormData,
): Promise<void> {
  const context = await requireTenantContext();
  requirePermission(context, "BOOKINGS_WRITE");
  const requestId = formData.get("requestId");
  const decision = formData.get("decision");
  const reason = formData.get("reason");
  if (
    typeof requestId !== "string" ||
    (decision !== "APPROVE" && decision !== "REJECT") ||
    typeof reason !== "string"
  ) {
    redirect("/admin/bookings?error=VALIDATION_ERROR");
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("decide_reschedule_request", {
    p_request_id: requestId,
    p_decision: decision,
    p_reason: reason,
  });
  if (error) redirectWithSafeBookingError(error.message);
  revalidatePath("/admin/bookings");
  redirect(`/admin/bookings?success=reschedule_${decision.toLowerCase()}`);
}

function redirectWithSafeBookingError(message: string): never {
  const codes = [
    "VERSION_CONFLICT",
    "INVALID_STATUS_TRANSITION",
    "REASON_REQUIRED",
    "LINE_ID_REQUIRED",
    "PAYMENT_DEADLINE_EXPIRED",
    "ROOM_UNAVAILABLE",
    "RESCHEDULE_LIMIT_REACHED",
  ] as const;
  const code = codes.find((item) => message.includes(item)) ?? "UNKNOWN";
  redirect(`/admin/bookings?error=${code}`);
}
