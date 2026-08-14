"use server";

import { z } from "zod";

import {
  requirePermission,
  requireTenantContext,
} from "@/data/auth/tenant-context";
import { listOperationalBookings } from "@/data/operations/list-operations";
import {
  calculateSettlement,
  CHARGE_CATEGORIES,
} from "@/domain/finance/settlement";
import {
  buildPromptPayPayload,
  maskPromptPayTarget,
} from "@/integrations/promptpay/payload";
import { renderPromptPayQrDataUrl } from "@/integrations/promptpay/qr";

const requestSchema = z.object({
  bookingId: z.uuid(),
  expectedVersion: z.number().int().nonnegative(),
  charges: z
    .array(
      z.object({
        category: z.enum(CHARGE_CATEGORIES),
        amountSatang: z.number().int().positive().max(2_147_483_647),
        detail: z.string().trim().max(150).optional(),
      }),
    )
    .max(50),
});

export type PromptPayQuoteResult =
  | {
      readonly status: "READY";
      readonly amountDueSatang: number;
      readonly qrDataUrl: string;
      readonly payeeName: string;
      readonly maskedTarget: string;
    }
  | {
      readonly status:
        | "INVALID_INPUT"
        | "BOOKING_CHANGED"
        | "NOT_FINAL_CHECKOUT"
        | "NO_AMOUNT_DUE"
        | "NOT_CONFIGURED"
        | "UNAVAILABLE";
    };

export async function generatePromptPayQuoteAction(
  rawRequest: unknown,
): Promise<PromptPayQuoteResult> {
  const request = requestSchema.safeParse(rawRequest);
  if (!request.success) return { status: "INVALID_INPUT" };

  const context = await requireTenantContext();
  requirePermission(context, "PAYMENTS_COLLECT");
  if (
    !context.promptpayQrEnabled ||
    !context.promptpayTargetType ||
    !context.promptpayTargetValue ||
    !context.promptpayPayeeName
  ) {
    return { status: "NOT_CONFIGURED" };
  }

  try {
    const [booking] = await listOperationalBookings(context.tenantId, {
      bookingIds: [request.data.bookingId],
    });
    if (
      !booking ||
      booking.status !== "CHECKED_IN" ||
      booking.version !== request.data.expectedVersion
    ) {
      return { status: "BOOKING_CHANGED" };
    }
    if (!booking.finalGroupCheckout) {
      return { status: "NOT_FINAL_CHECKOUT" };
    }

    const settlement = calculateSettlement({
      lodgingTotalSatang:
        booking.groupLodgingTotalSatang + booking.groupExtraChargesSatang,
      depositSatang: booking.verifiedDepositSatang,
      charges: request.data.charges,
    });
    if (settlement.amountDueSatang <= 0) {
      return { status: "NO_AMOUNT_DUE" };
    }

    const payload = buildPromptPayPayload({
      targetType: context.promptpayTargetType,
      targetValue: context.promptpayTargetValue,
      amountSatang: settlement.amountDueSatang,
      merchantName: context.englishName,
    });
    return {
      status: "READY",
      amountDueSatang: settlement.amountDueSatang,
      qrDataUrl: await renderPromptPayQrDataUrl(payload),
      payeeName: context.promptpayPayeeName,
      maskedTarget: maskPromptPayTarget(
        context.promptpayTargetType,
        context.promptpayTargetValue,
      ),
    };
  } catch {
    return { status: "UNAVAILABLE" };
  }
}
