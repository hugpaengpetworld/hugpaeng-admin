import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ReceiptSummary {
  readonly id: string;
  readonly receiptNo: string;
  readonly status: "ISSUED" | "VOID";
  readonly issuedAt: string;
  readonly customerName: string;
  readonly roomSummary: string;
  readonly totalSatang: number;
  readonly refundDueSatang: number;
  readonly paymentStatus: string;
}

export interface ReceiptItem {
  readonly id: string;
  readonly lineNo: number;
  readonly itemType: "LODGING" | "EXTRA";
  readonly itemName: string;
  readonly description: string | null;
  readonly quantity: number;
  readonly unit: string;
  readonly unitPriceSatang: number;
  readonly amountSatang: number;
}

export interface ReceiptDetail extends ReceiptSummary {
  readonly bookingId: string;
  readonly bookingGroupId: string;
  readonly clinicThaiName: string;
  readonly clinicEnglishName: string;
  readonly clinicAddress: string | null;
  readonly clinicPhone: string | null;
  readonly taxSectionEnabled: boolean;
  readonly taxHeading: string | null;
  readonly taxId: string | null;
  readonly branchNumber: string | null;
  readonly customerPhone: string;
  readonly petSummary: string;
  readonly actualCheckedInAt: string;
  readonly actualCheckedOutAt: string;
  readonly lodgingTotalSatang: number;
  readonly extraChargesSatang: number;
  readonly depositSatang: number;
  readonly amountDueSatang: number;
  readonly paidAtCheckoutSatang: number;
  readonly paymentMethod: string;
  readonly notes: string | null;
  readonly artifactStatus: string;
  readonly artifactGeneration: number;
  readonly voidReason: string | null;
  readonly reissuedFromReceiptId: string | null;
  readonly items: readonly ReceiptItem[];
  readonly depositPaymentId: string | null;
  readonly hasDepositSourceAccount: boolean;
  readonly refundRecorded: boolean;
}

interface RawReceipt {
  id: string;
  booking_id: string;
  booking_group_id: string;
  receipt_no: string;
  status: "ISSUED" | "VOID";
  issued_at: string;
  clinic_thai_name: string;
  clinic_english_name: string;
  clinic_address: string | null;
  clinic_phone: string | null;
  tax_section_enabled: boolean;
  tax_heading: string | null;
  tax_id: string | null;
  branch_number: string | null;
  customer_name: string;
  customer_phone: string;
  pet_summary: string;
  room_summary: string;
  actual_checked_in_at: string;
  actual_checked_out_at: string;
  lodging_total_satang: number;
  extra_charges_satang: number;
  total_satang: number;
  deposit_satang: number;
  amount_due_satang: number;
  paid_at_checkout_satang: number;
  refund_due_satang: number;
  payment_method: string;
  payment_status: string;
  notes: string | null;
  artifact_status: string;
  artifact_generation: number;
  void_reason: string | null;
  reissued_from_receipt_id: string | null;
}

export async function listReceipts(): Promise<ReceiptSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("receipts")
    .select(
      "id, receipt_no, status, issued_at, customer_name, room_summary, total_satang, refund_due_satang, payment_status",
    )
    .order("issued_at", { ascending: false })
    .limit(200);
  if (error) throw new Error("RECEIPT_LIST_FAILED");
  return (data ?? []).map((receipt) => ({
    id: receipt.id,
    receiptNo: receipt.receipt_no,
    status: receipt.status,
    issuedAt: receipt.issued_at,
    customerName: receipt.customer_name,
    roomSummary: receipt.room_summary,
    totalSatang: receipt.total_satang,
    refundDueSatang: receipt.refund_due_satang,
    paymentStatus: receipt.payment_status,
  }));
}

export async function getReceiptDetail(
  receiptId: string,
): Promise<ReceiptDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("receipts")
    .select("*")
    .eq("id", receiptId)
    .maybeSingle();
  if (error) throw new Error("RECEIPT_READ_FAILED");
  if (!data) return null;
  const receipt = data as RawReceipt;

  const [itemsResult, paymentsResult] = await Promise.all([
    supabase
      .from("receipt_items")
      .select(
        "id, line_no, item_type, item_name, description, quantity, unit, unit_price_satang, amount_satang",
      )
      .eq("receipt_id", receiptId)
      .order("line_no", { ascending: true }),
    supabase
      .from("payments")
      .select(
        "id, payment_type, source_account_name_normalized, source_account_last4, status",
      )
      .eq("booking_group_id", receipt.booking_group_id),
  ]);
  if (itemsResult.error || paymentsResult.error) {
    throw new Error("RECEIPT_READ_FAILED");
  }
  const deposit = (paymentsResult.data ?? []).find(
    ({ payment_type }) => payment_type === "DEPOSIT",
  );
  const refund = (paymentsResult.data ?? []).find(
    ({ payment_type }) => payment_type === "REFUND",
  );

  return {
    id: receipt.id,
    bookingId: receipt.booking_id,
    bookingGroupId: receipt.booking_group_id,
    receiptNo: receipt.receipt_no,
    status: receipt.status,
    issuedAt: receipt.issued_at,
    clinicThaiName: receipt.clinic_thai_name,
    clinicEnglishName: receipt.clinic_english_name,
    clinicAddress: receipt.clinic_address,
    clinicPhone: receipt.clinic_phone,
    taxSectionEnabled: receipt.tax_section_enabled,
    taxHeading: receipt.tax_heading,
    taxId: receipt.tax_id,
    branchNumber: receipt.branch_number,
    customerName: receipt.customer_name,
    customerPhone: receipt.customer_phone,
    petSummary: receipt.pet_summary,
    roomSummary: receipt.room_summary,
    actualCheckedInAt: receipt.actual_checked_in_at,
    actualCheckedOutAt: receipt.actual_checked_out_at,
    lodgingTotalSatang: receipt.lodging_total_satang,
    extraChargesSatang: receipt.extra_charges_satang,
    totalSatang: receipt.total_satang,
    depositSatang: receipt.deposit_satang,
    amountDueSatang: receipt.amount_due_satang,
    paidAtCheckoutSatang: receipt.paid_at_checkout_satang,
    refundDueSatang: receipt.refund_due_satang,
    paymentMethod: receipt.payment_method,
    paymentStatus: receipt.payment_status,
    notes: receipt.notes,
    artifactStatus: receipt.artifact_status,
    artifactGeneration: receipt.artifact_generation,
    voidReason: receipt.void_reason,
    reissuedFromReceiptId: receipt.reissued_from_receipt_id,
    items: (itemsResult.data ?? []).map((item) => ({
      id: item.id,
      lineNo: item.line_no,
      itemType: item.item_type,
      itemName: item.item_name,
      description: item.description,
      quantity: Number(item.quantity),
      unit: item.unit,
      unitPriceSatang: item.unit_price_satang,
      amountSatang: item.amount_satang,
    })),
    depositPaymentId: deposit?.id ?? null,
    hasDepositSourceAccount: Boolean(
      deposit?.source_account_name_normalized && deposit.source_account_last4,
    ),
    refundRecorded: refund?.status === "REFUNDED",
  };
}
