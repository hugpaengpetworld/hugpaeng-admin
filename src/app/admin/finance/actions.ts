"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOwner, requireTenantContext } from "@/data/auth/tenant-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function recordDepositSourceAction(
  formData: FormData,
): Promise<void> {
  await requireTenantContext();
  const receiptId = field(formData, "receiptId");
  const paymentId = field(formData, "paymentId");
  const accountName = field(formData, "accountName");
  const accountLast4 = field(formData, "accountLast4");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_deposit_source_account", {
    p_payment_id: paymentId,
    p_account_name: accountName,
    p_account_last4: accountLast4,
  });
  if (error) redirectFinanceError(receiptId, error.message);
  revalidatePath(`/admin/finance/receipts/${receiptId}`);
  redirect(
    `/admin/finance/receipts/${receiptId}?success=source_account_recorded`,
  );
}

export async function recordRefundAction(formData: FormData): Promise<void> {
  const context = await requireTenantContext();
  requireOwner(context);
  const receiptId = field(formData, "receiptId");
  const paymentId = field(formData, "paymentId");
  const accountName = field(formData, "accountName");
  const accountNumber = field(formData, "accountNumber");
  const notes = field(formData, "notes", true);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_refund", {
    p_payment_id: paymentId,
    p_account_name: accountName,
    p_account_number: accountNumber,
    p_notes: notes,
  });
  if (error) redirectFinanceError(receiptId, error.message);
  revalidatePath("/admin/finance");
  revalidatePath(`/admin/finance/receipts/${receiptId}`);
  redirect(`/admin/finance/receipts/${receiptId}?success=refund_recorded`);
}

export async function voidReceiptAction(formData: FormData): Promise<void> {
  const context = await requireTenantContext();
  requireOwner(context);
  const receiptId = field(formData, "receiptId");
  const reason = field(formData, "reason");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("void_receipt", {
    p_receipt_id: receiptId,
    p_reason: reason,
  });
  if (error) redirectFinanceError(receiptId, error.message);
  revalidatePath("/admin/finance");
  revalidatePath(`/admin/finance/receipts/${receiptId}`);
  redirect(`/admin/finance/receipts/${receiptId}?success=voided`);
}

export async function reissueReceiptAction(formData: FormData): Promise<void> {
  const context = await requireTenantContext();
  requireOwner(context);
  const receiptId = field(formData, "receiptId");
  const reason = field(formData, "reason");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reissue_receipt", {
    p_receipt_id: receiptId,
    p_reason: reason,
  });
  if (error) redirectFinanceError(receiptId, error.message);
  const newReceiptId = typeof data === "string" ? data : receiptId;
  revalidatePath("/admin/finance");
  revalidatePath(`/admin/finance/receipts/${receiptId}`);
  redirect(`/admin/finance/receipts/${newReceiptId}?success=reissued`);
}

export async function regenerateReceiptArtifactAction(
  formData: FormData,
): Promise<void> {
  await requireTenantContext();
  const receiptId = field(formData, "receiptId");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("regenerate_receipt_artifact", {
    p_receipt_id: receiptId,
  });
  if (error) redirectFinanceError(receiptId, error.message);
  revalidatePath(`/admin/finance/receipts/${receiptId}`);
  redirect(`/admin/finance/receipts/${receiptId}?success=artifact_queued`);
}

function field(formData: FormData, name: string, allowEmpty = false): string {
  const value = formData.get(name);
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    redirect("/admin/finance?error=VALIDATION_ERROR");
  }
  return value;
}

function redirectFinanceError(receiptId: string, message: string): never {
  const codes = [
    "FORBIDDEN",
    "ORIGINAL_ACCOUNT_EVIDENCE_REQUIRED",
    "REFUND_ACCOUNT_MISMATCH",
    "REFUND_NOT_DUE",
    "REASON_REQUIRED",
    "RECEIPT_ALREADY_VOID",
    "VALIDATION_ERROR",
  ] as const;
  const code = codes.find((item) => message.includes(item)) ?? "UNKNOWN";
  redirect(`/admin/finance/receipts/${receiptId}?error=${code}`);
}
