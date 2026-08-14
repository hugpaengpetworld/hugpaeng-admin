"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  requirePermission,
  requireTenantContext,
} from "@/data/auth/tenant-context";
import {
  sterilizationAppointmentSchema,
  sterilizationStatusSchema,
} from "@/domain/sterilization/rules";
import { isIsoDate } from "@/domain/shared/date";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const holidaySchema = z.object({
  holidayDate: z.string().refine(isIsoDate),
  reason: z.string().trim().min(1).max(300),
  isActive: z.boolean(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

const safeErrors = [
  "APPOINTMENT_DATE_IN_PAST",
  "BACK_OFFICE_CHANNEL_REQUIRED",
  "CUSTOM_SPECIES_REQUIRED",
  "INVALID_PHONE",
  "STERILIZATION_HOLIDAY",
  "HOLIDAY_OVERRIDE_FORBIDDEN",
  "OVERBOOK_ACKNOWLEDGEMENT_REQUIRED",
  "INVALID_STATUS_TRANSITION",
  "REASON_REQUIRED",
  "FORBIDDEN",
  "PET_SEX_REQUIRED",
] as const;

export async function createSterilizationAppointmentAction(
  formData: FormData,
): Promise<void> {
  const context = await requireTenantContext();
  requirePermission(context, "STERILIZATION_WRITE");
  const weightValue = String(formData.get("weightKg") ?? "").trim();
  const input = sterilizationAppointmentSchema.safeParse({
    appointmentDate: formData.get("appointmentDate"),
    customerId: formData.get("customerId") || undefined,
    petId: formData.get("petId") || undefined,
    appointmentTime: formData.get("appointmentTime"),
    customerName: formData.get("customerName"),
    phone: formData.get("phone"),
    petName: formData.get("petName"),
    species: formData.get("species"),
    customSpecies: formData.get("customSpecies") || undefined,
    sex: formData.get("sex"),
    breed: formData.get("breed") || undefined,
    weightKg: weightValue ? Number(weightValue) : undefined,
    ageText: formData.get("ageText") || undefined,
    vaccinationStatus: formData.get("vaccinationStatus") || undefined,
    sourceChannel: formData.get("sourceChannel"),
    notes: formData.get("notes") || undefined,
    acknowledgeOverbook: formData.get("acknowledgeOverbook") === "on",
    holidayOverride: formData.get("holidayOverride") === "on",
  });
  if (!input.success)
    redirect("/admin/sterilization/new?error=VALIDATION_ERROR");

  const supabase = await createSupabaseServerClient();
  const { error } = input.data.customerId
    ? await supabase.rpc("create_registry_sterilization_appointment", {
        p_tenant_id: context.tenantId,
        p_customer_id: input.data.customerId,
        p_pet_id: input.data.petId!,
        p_appointment_date: input.data.appointmentDate,
        p_appointment_time: input.data.appointmentTime,
        p_source_channel: input.data.sourceChannel,
        p_notes: input.data.notes ?? null,
        p_acknowledge_overbook: input.data.acknowledgeOverbook,
        p_holiday_override: input.data.holidayOverride,
      })
    : await supabase.rpc("create_sterilization_appointment", {
        p_tenant_id: context.tenantId,
        p_appointment_date: input.data.appointmentDate,
        p_appointment_time: input.data.appointmentTime,
        p_customer_name: input.data.customerName,
        p_phone: input.data.phone,
        p_pet_name: input.data.petName,
        p_species: input.data.species,
        p_custom_species: input.data.customSpecies ?? null,
        p_sex: input.data.sex,
        p_breed: input.data.breed ?? null,
        p_weight_kg: input.data.weightKg ?? null,
        p_age_text: input.data.ageText ?? null,
        p_vaccination_status: input.data.vaccinationStatus ?? null,
        p_source_channel: input.data.sourceChannel,
        p_notes: input.data.notes ?? null,
        p_acknowledge_overbook: input.data.acknowledgeOverbook,
        p_holiday_override: input.data.holidayOverride,
      });
  if (error)
    redirectSterilizationError("/admin/sterilization/new", error.message);

  revalidatePath("/admin/sterilization");
  redirect(
    `/admin/sterilization?month=${input.data.appointmentDate.slice(0, 7)}&success=created`,
  );
}

export async function updateSterilizationStatusAction(
  formData: FormData,
): Promise<void> {
  const context = await requireTenantContext();
  requirePermission(context, "STERILIZATION_WRITE");
  const appointmentId = z.uuid().safeParse(formData.get("appointmentId"));
  const status = sterilizationStatusSchema.safeParse(formData.get("status"));
  const returnPath = String(
    formData.get("returnPath") ?? "/admin/sterilization/list",
  );
  if (
    !appointmentId.success ||
    !status.success ||
    !returnPath.startsWith("/admin/sterilization")
  ) {
    redirect("/admin/sterilization/list?error=VALIDATION_ERROR");
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_sterilization_status", {
    p_appointment_id: appointmentId.data,
    p_status: status.data,
  });
  if (error) redirectSterilizationError(returnPath, error.message);
  revalidatePath("/admin/sterilization");
  redirect(
    `${returnPath}${returnPath.includes("?") ? "&" : "?"}success=status_updated`,
  );
}

export async function saveSterilizationHolidayAction(
  formData: FormData,
): Promise<void> {
  const context = await requireTenantContext();
  requirePermission(context, "STERILIZATION_HOLIDAY_MANAGE");
  const input = holidaySchema.safeParse({
    holidayDate: formData.get("holidayDate"),
    reason: formData.get("reason"),
    isActive: formData.get("isActive") !== "false",
    month: formData.get("month"),
  });
  if (!input.success) redirect("/admin/sterilization?error=VALIDATION_ERROR");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_sterilization_holiday", {
    p_tenant_id: context.tenantId,
    p_holiday_date: input.data.holidayDate,
    p_reason: input.data.reason,
    p_is_active: input.data.isActive,
  });
  if (error) redirectSterilizationError("/admin/sterilization", error.message);
  revalidatePath("/admin/sterilization");
  redirect(
    `/admin/sterilization?month=${input.data.month}&success=holiday_updated`,
  );
}

function redirectSterilizationError(path: string, message: string): never {
  const code = safeErrors.find((item) => message.includes(item)) ?? "UNKNOWN";
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${code}`);
}
