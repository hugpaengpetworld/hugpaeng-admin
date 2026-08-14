"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireOwner, requireTenantContext } from "@/data/auth/tenant-context";
import {
  detectLogoFileType,
  type LogoExtension,
  type LogoMimeType,
} from "@/domain/files/logo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PROMPTPAY_TARGET_TYPES } from "@/integrations/promptpay/payload";

const settingsSchema = z
  .object({
    thaiName: z.string().trim().min(1).max(200),
    englishName: z.string().trim().min(1).max(200),
    clinicAddress: z.string().trim().max(500),
    contactPhone: z
      .string()
      .trim()
      .transform((value) => value.replace(/[^0-9+]/g, ""))
      .refine((value) => value === "" || /^\+?[0-9]{8,15}$/.test(value)),
    receiptTaxEnabled: z.boolean(),
    receiptTaxHeading: z.string().trim().max(100),
    taxId: z
      .string()
      .trim()
      .transform((value) => value.replace(/[^0-9]/g, ""))
      .refine((value) => value === "" || /^[0-9]{13}$/.test(value)),
    branchNumber: z.string().trim().max(50),
    removeLogo: z.boolean(),
    promptpayDisplayValue: z.string().trim().max(100),
    promptpayQrEnabled: z.boolean(),
    promptpayTargetType: z.enum(PROMPTPAY_TARGET_TYPES).or(z.literal("")),
    promptpayTargetValue: z
      .string()
      .trim()
      .transform((value) => value.replace(/[^0-9]/g, "")),
    promptpayPayeeName: z.string().trim().max(150),
    bankName: z.string().trim().max(100),
    bankAccountName: z.string().trim().max(150),
    bankAccountNumberMasked: z.string().trim().max(50),
  })
  .superRefine((value, context) => {
    if (value.receiptTaxEnabled) {
      if (!value.receiptTaxHeading) {
        context.addIssue({
          code: "custom",
          path: ["receiptTaxHeading"],
          message: "TAX_HEADING_REQUIRED",
        });
      }
      if (!value.taxId && !value.branchNumber) {
        context.addIssue({
          code: "custom",
          path: ["taxId"],
          message: "TAX_IDENTITY_REQUIRED",
        });
      }
    }
    if (!value.promptpayQrEnabled) return;
    if (!value.promptpayTargetType || !value.promptpayPayeeName) {
      context.addIssue({
        code: "custom",
        path: ["promptpayTargetType"],
        message: "PROMPTPAY_CONFIGURATION_INCOMPLETE",
      });
    }
    const validTarget =
      (value.promptpayTargetType === "MOBILE" &&
        /^0[0-9]{9}$/.test(value.promptpayTargetValue)) ||
      (value.promptpayTargetType === "NATIONAL_ID" &&
        /^[0-9]{13}$/.test(value.promptpayTargetValue)) ||
      (value.promptpayTargetType === "EWALLET" &&
        /^[0-9]{15}$/.test(value.promptpayTargetValue));
    if (!validTarget) {
      context.addIssue({
        code: "custom",
        path: ["promptpayTargetValue"],
        message: "PROMPTPAY_TARGET_INVALID",
      });
    }
  });

interface ValidatedLogo {
  readonly file: File;
  readonly mimeType: LogoMimeType;
  readonly extension: LogoExtension;
}

export async function updateClinicSettingsAction(
  formData: FormData,
): Promise<void> {
  const context = await requireTenantContext();
  requireOwner(context);
  const input = settingsSchema.safeParse({
    thaiName: formData.get("thaiName"),
    englishName: formData.get("englishName"),
    clinicAddress: formData.get("clinicAddress") ?? "",
    contactPhone: formData.get("contactPhone") ?? "",
    receiptTaxEnabled: formData.get("receiptTaxEnabled") === "on",
    receiptTaxHeading: formData.get("receiptTaxHeading") ?? "",
    taxId: formData.get("taxId") ?? "",
    branchNumber: formData.get("branchNumber") ?? "",
    removeLogo: formData.get("removeLogo") === "on",
    promptpayDisplayValue: formData.get("promptpayDisplayValue") ?? "",
    promptpayQrEnabled: formData.get("promptpayQrEnabled") === "on",
    promptpayTargetType: formData.get("promptpayTargetType") ?? "",
    promptpayTargetValue: formData.get("promptpayTargetValue") ?? "",
    promptpayPayeeName: formData.get("promptpayPayeeName") ?? "",
    bankName: formData.get("bankName") ?? "",
    bankAccountName: formData.get("bankAccountName") ?? "",
    bankAccountNumberMasked: formData.get("bankAccountNumberMasked") ?? "",
  });
  if (!input.success) redirect("/admin/settings?error=invalid_input");

  const logoValue = formData.get("logo");
  const logo =
    logoValue instanceof File && logoValue.size > 0
      ? await validateLogo(logoValue)
      : null;
  if (logoValue instanceof File && logoValue.size > 0 && !logo) {
    redirect("/admin/settings?error=invalid_logo");
  }

  const supabase = await createSupabaseServerClient();
  let uploadedPath: string | null = null;
  if (logo) {
    uploadedPath = `${context.tenantId}/branding/${randomUUID()}.${logo.extension}`;
    const { error: uploadError } = await supabase.storage
      .from("tenant-assets")
      .upload(uploadedPath, logo.file, {
        contentType: logo.mimeType,
        cacheControl: "3600",
        upsert: false,
      });
    if (uploadError) redirect("/admin/settings?error=upload_failed");
  }

  const logoStoragePath =
    uploadedPath ?? (input.data.removeLogo ? null : context.logoStoragePath);
  const { error } = await supabase.rpc("update_tenant_configuration", {
    p_tenant_id: context.tenantId,
    p_thai_name: input.data.thaiName,
    p_english_name: input.data.englishName,
    p_clinic_address: input.data.clinicAddress || null,
    p_contact_phone: input.data.contactPhone || null,
    p_receipt_tax_enabled: input.data.receiptTaxEnabled,
    p_receipt_tax_heading: input.data.receiptTaxHeading || null,
    p_tax_id: input.data.taxId || null,
    p_branch_number: input.data.branchNumber || null,
    p_logo_storage_path: logoStoragePath,
    p_logo_mime_type: logo?.mimeType ?? null,
    p_logo_size_bytes: logo?.file.size ?? null,
    p_promptpay_display_value: input.data.promptpayDisplayValue || null,
    p_promptpay_qr_enabled: input.data.promptpayQrEnabled,
    p_promptpay_target_type: input.data.promptpayTargetType || null,
    p_promptpay_target_value: input.data.promptpayTargetValue || null,
    p_promptpay_payee_name: input.data.promptpayPayeeName || null,
    p_bank_name: input.data.bankName || null,
    p_bank_account_name: input.data.bankAccountName || null,
    p_bank_account_number_masked: input.data.bankAccountNumberMasked || null,
  });
  if (error) {
    if (uploadedPath)
      await supabase.storage.from("tenant-assets").remove([uploadedPath]);
    redirect("/admin/settings?error=save_failed");
  }

  revalidatePath("/admin", "layout");
  revalidatePath("/admin/settings");
  redirect("/admin/settings?success=1");
}

async function validateLogo(file: File): Promise<ValidatedLogo | null> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const detected = detectLogoFileType({
    declaredMimeType: file.type,
    sizeBytes: file.size,
    header: bytes,
  });
  return detected ? { file, ...detected } : null;
}
