"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  requirePermission,
  requireTenantContext,
} from "@/data/auth/tenant-context";
import {
  type ChargeInput,
  parseBahtToSatang,
} from "@/domain/finance/settlement";
import { parseCheckoutChargeRows } from "@/features/checkout/parse-charge-rows";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const chargeFields = [
  ["FOOD", "chargeFood"],
  ["MEDICINE", "chargeMedicine"],
  ["IV_FLUIDS", "chargeIvFluids"],
  ["BLOOD_TEST", "chargeBloodTest"],
  ["OTHER", "chargeOther"],
] as const;

const paymentMethods = [
  "CASH",
  "TRANSFER",
  "PROMPTPAY",
  "CARD",
  "OTHER",
  "NOT_SPECIFIED",
] as const;

export async function checkInBookingAction(formData: FormData): Promise<void> {
  const context = await requireTenantContext();
  requirePermission(context, "CHECK_IN");
  const bookingId = textField(formData, "bookingId");
  const roomId = textField(formData, "roomId");
  const notes = textField(formData, "notes", true);
  const idempotencyKey = textField(formData, "idempotencyKey");
  const expectedVersion = Number(formData.get("expectedVersion"));
  let depositSatang: number;
  try {
    depositSatang = parseBahtToSatang(textField(formData, "depositBaht"));
  } catch {
    redirect("/admin/operations?error=VALIDATION_ERROR");
  }
  if (!Number.isInteger(expectedVersion)) {
    redirect("/admin/operations?error=VALIDATION_ERROR");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("check_in_booking", {
    p_booking_id: bookingId,
    p_room_id: roomId,
    p_deposit_satang: depositSatang,
    p_notes: notes,
    p_expected_version: expectedVersion,
    p_idempotency_key: idempotencyKey,
  });
  if (error) redirectOperationError(error.message);
  revalidatePath("/admin/operations");
  revalidatePath("/admin/rooms/cats");
  revalidatePath("/admin/rooms/dogs");
  redirect("/admin/operations?success=checked_in");
}

export async function checkInRoomBookingAction(
  formData: FormData,
): Promise<void> {
  const context = await requireTenantContext();
  requirePermission(context, "CHECK_IN");
  const returnTo = safeRoomReturnPath(formData.get("returnTo"));
  const bookingId = textField(formData, "bookingId", false, returnTo);
  const roomId = textField(formData, "roomId", false, returnTo);
  const notes = textField(formData, "notes", true, returnTo);
  const idempotencyKey = textField(formData, "idempotencyKey", false, returnTo);
  const expectedVersion = Number(formData.get("expectedVersion"));
  let depositSatang: number;
  try {
    depositSatang = parseBahtToSatang(
      textField(formData, "depositBaht", false, returnTo),
    );
  } catch {
    redirect(withResult(returnTo, "error", "VALIDATION_ERROR"));
  }
  if (!Number.isInteger(expectedVersion)) {
    redirect(withResult(returnTo, "error", "VALIDATION_ERROR"));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("check_in_room_booking", {
    p_booking_id: bookingId,
    p_room_id: roomId,
    p_deposit_satang: depositSatang,
    p_notes: notes,
    p_expected_version: expectedVersion,
    p_idempotency_key: idempotencyKey,
  });
  if (error) redirectOperationError(error.message, returnTo);
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/operations");
  revalidatePath("/admin/rooms/cats");
  revalidatePath("/admin/rooms/dogs");
  redirect(withResult(returnTo, "success", "checked_in"));
}

export async function checkOutBookingAction(formData: FormData): Promise<void> {
  const context = await requireTenantContext();
  requirePermission(context, "CHECK_OUT");
  const returnTo = safeRoomReturnPath(formData.get("returnTo"));
  const bookingId = textField(formData, "bookingId", false, returnTo);
  const notes = textField(formData, "notes", true, returnTo);
  const idempotencyKey = textField(formData, "idempotencyKey", false, returnTo);
  const expectedVersion = Number(formData.get("expectedVersion"));
  const paymentMethod = textField(formData, "paymentMethod", false, returnTo);
  const quotedAmountValue = formData.get("promptpayQuotedAmountSatang");
  const promptpayQuotedAmountSatang =
    typeof quotedAmountValue === "string" &&
    /^\d{1,10}$/.test(quotedAmountValue) &&
    Number(quotedAmountValue) <= 2_147_483_647
      ? Number(quotedAmountValue)
      : null;
  const promptpayReceivedConfirmed =
    formData.get("confirmPromptpayReceived") === "on";
  if (
    !Number.isInteger(expectedVersion) ||
    !paymentMethods.includes(paymentMethod as (typeof paymentMethods)[number])
  ) {
    redirect(withResult(returnTo, "error", "VALIDATION_ERROR"));
  }

  let charges: ChargeInput[];
  try {
    charges = formData.has("chargeCategory")
      ? parseChargeRows(formData)
      : parseLegacyChargeFields(formData, returnTo);
  } catch {
    redirect(withResult(returnTo, "error", "INVALID_CHARGE"));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("check_out_booking", {
    p_booking_id: bookingId,
    p_charges: charges,
    p_payment: {
      method: paymentMethod,
      quotedAmountSatang: promptpayQuotedAmountSatang,
      receivedConfirmed: promptpayReceivedConfirmed,
    },
    p_confirm_early_checkout: formData.get("confirmEarlyCheckout") === "on",
    p_notes: notes,
    p_expected_version: expectedVersion,
    p_idempotency_key: idempotencyKey,
  });
  if (error) redirectOperationError(error.message, returnTo);
  const result = data as { receiptId?: string } | null;
  revalidatePath("/admin/operations");
  revalidatePath("/admin/finance");
  revalidatePath("/admin/rooms/cats");
  revalidatePath("/admin/rooms/dogs");
  if (result?.receiptId) {
    redirect(`/admin/finance/receipts/${result.receiptId}?success=checked_out`);
  }
  redirect(withResult(returnTo, "success", "checked_out"));
}

function parseChargeRows(formData: FormData): ChargeInput[] {
  const categories = formData.getAll("chargeCategory");
  const amounts = formData.getAll("chargeAmount");
  const details = formData.getAll("chargeDetail");
  if (
    categories.length > 50 ||
    categories.length !== amounts.length ||
    categories.length !== details.length
  ) {
    throw new RangeError("INVALID_CHARGE");
  }

  const rows: Array<{ category: string; amount: string; detail: string }> = [];
  for (let index = 0; index < categories.length; index += 1) {
    const categoryValue = categories[index];
    const amountValue = amounts[index];
    const detailValue = details[index];
    if (
      typeof categoryValue !== "string" ||
      typeof amountValue !== "string" ||
      typeof detailValue !== "string"
    ) {
      throw new RangeError("INVALID_CHARGE");
    }
    rows.push({
      category: categoryValue,
      amount: amountValue,
      detail: detailValue,
    });
  }
  return parseCheckoutChargeRows(rows);
}

function parseLegacyChargeFields(
  formData: FormData,
  returnTo: string,
): ChargeInput[] {
  const charges: ChargeInput[] = [];
  for (const [category, field] of chargeFields) {
    const raw = textField(formData, field, true, returnTo);
    if (!raw.trim()) continue;
    charges.push({
      category,
      amountSatang: parseBahtToSatang(raw),
      detail:
        category === "OTHER"
          ? textField(formData, "otherDetail", true, returnTo)
          : undefined,
    });
  }
  return charges;
}

function textField(
  formData: FormData,
  name: string,
  allowEmpty = false,
  returnTo = "/admin/operations",
): string {
  const value = formData.get(name);
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    redirect(withResult(returnTo, "error", "VALIDATION_ERROR"));
  }
  return value;
}

function redirectOperationError(
  message: string,
  returnTo = "/admin/operations",
): never {
  const safeCodes = [
    "VERSION_CONFLICT",
    "INVALID_STATUS_TRANSITION",
    "ROOM_UNAVAILABLE",
    "ROOM_SPECIES_MISMATCH",
    "ROOM_NOT_READY",
    "OPEN_STAY_EXISTS",
    "DEPOSIT_BELOW_VERIFIED",
    "LINE_DEPOSIT_REQUIRED",
    "LINE_ID_REQUIRED",
    "EARLY_CHECKOUT_CONFIRMATION_REQUIRED",
    "INVALID_CHARGE",
    "INVALID_PAYMENT_METHOD",
    "PROMPTPAY_PAYMENT_CONFIRMATION_REQUIRED",
    "IDEMPOTENCY_CONFLICT",
  ] as const;
  const code = safeCodes.find((item) => message.includes(item)) ?? "UNKNOWN";
  redirect(withResult(returnTo, "error", code));
}

function safeRoomReturnPath(value: FormDataEntryValue | null): string {
  if (
    typeof value === "string" &&
    /^\/admin\/rooms\/(cats|dogs)\?date=\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return value;
  }
  return "/admin/operations";
}

function withResult(
  path: string,
  key: "error" | "success",
  value: string,
): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${key}=${encodeURIComponent(value)}`;
}
