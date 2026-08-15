"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  requirePermission,
  requireTenantContext,
} from "@/data/auth/tenant-context";
import {
  searchPatientRegistry,
  type RegistryCustomer,
} from "@/data/customers/registry";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const petSchema = z.object({
  name: z.string().trim().min(1).max(120),
  species: z.enum(["CAT", "DOG"]),
  sex: z.enum(["MALE", "FEMALE"]).optional(),
  breed: z.string().trim().max(120).optional(),
  weightKg: z.coerce.number().positive().max(999.99).optional(),
  dateOfBirth: z.iso.date().optional(),
  ageText: z.string().trim().max(60).optional(),
  colorMarkings: z.string().trim().max(200).optional(),
  microchipNumber: z.string().trim().max(80).optional(),
  neutered: z.boolean().optional(),
});

const createCustomerSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{8,15}$/),
  email: z.email().optional(),
  address: z.string().trim().max(1000).optional(),
  pets: z.array(petSchema).min(1).max(10),
});

const addPetSchema = petSchema.extend({ customerId: z.uuid() });

export interface RegistrySearchState {
  readonly status: "idle" | "success" | "error";
  readonly query: string;
  readonly message?: string;
  readonly results: readonly RegistryCustomer[];
}

export async function searchPatientRegistryAction(
  _previous: RegistrySearchState,
  formData: FormData,
): Promise<RegistrySearchState> {
  const query = z
    .string()
    .trim()
    .min(2)
    .max(120)
    .safeParse(formData.get("query"));
  if (!query.success) {
    return {
      status: "error",
      query: String(formData.get("query") ?? "").trim(),
      message: "กรุณากรอกอย่างน้อย 2 ตัวอักษร",
      results: [],
    };
  }
  try {
    return {
      status: "success",
      query: query.data,
      results: await searchPatientRegistry(query.data),
    };
  } catch {
    return {
      status: "error",
      query: query.data,
      message: "ค้นหาทะเบียนไม่สำเร็จ กรุณาลองใหม่",
      results: [],
    };
  }
}

export async function createRegistryCustomerAction(
  formData: FormData,
): Promise<void> {
  const context = await requireTenantContext();
  requirePermission(context, "CUSTOMERS_WRITE");
  requirePermission(context, "PETS_WRITE");
  const petPayload = formData.get("pets");
  let pets: unknown;
  try {
    pets = typeof petPayload === "string" ? JSON.parse(petPayload) : null;
  } catch {
    redirect("/admin/customers?error=VALIDATION_ERROR");
  }
  const input = createCustomerSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: normalizePhone(String(formData.get("phone") ?? "")),
    email: emptyToUndefined(formData.get("email")),
    address: emptyToUndefined(formData.get("address")),
    pets,
  });
  if (!input.success) redirect("/admin/customers?error=VALIDATION_ERROR");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_registry_customer_with_pets", {
    p_tenant_id: context.tenantId,
    p_full_name: input.data.fullName,
    p_phone: input.data.phone,
    p_email: input.data.email ?? null,
    p_address: input.data.address ?? null,
    p_pets: input.data.pets,
  });
  if (error) {
    const code = error.message.includes("CUSTOMER_PHONE_EXISTS")
      ? "CUSTOMER_PHONE_EXISTS"
      : "UNKNOWN";
    redirect(`/admin/customers?error=${code}`);
  }
  revalidatePath("/admin/customers");
  redirect("/admin/customers?success=created");
}

export async function addRegistryPetAction(formData: FormData): Promise<void> {
  const context = await requireTenantContext();
  requirePermission(context, "PETS_WRITE");
  const input = addPetSchema.safeParse({
    customerId: formData.get("customerId"),
    name: formData.get("name"),
    species: formData.get("species"),
    sex: emptyToUndefined(formData.get("sex")),
    breed: emptyToUndefined(formData.get("breed")),
    weightKg: emptyToUndefined(formData.get("weightKg")),
    dateOfBirth: emptyToUndefined(formData.get("dateOfBirth")),
    ageText: emptyToUndefined(formData.get("ageText")),
    colorMarkings: emptyToUndefined(formData.get("colorMarkings")),
    microchipNumber: emptyToUndefined(formData.get("microchipNumber")),
    neutered:
      formData.get("neutered") === "true"
        ? true
        : formData.get("neutered") === "false"
          ? false
          : undefined,
  });
  if (!input.success) redirect("/admin/customers?error=VALIDATION_ERROR");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_registry_pet", {
    p_customer_id: input.data.customerId,
    p_name: input.data.name,
    p_species: input.data.species,
    p_sex: input.data.sex ?? null,
    p_breed: input.data.breed ?? null,
    p_weight_kg: input.data.weightKg ?? null,
    p_date_of_birth: input.data.dateOfBirth ?? null,
    p_age_text: input.data.ageText ?? null,
    p_color_markings: input.data.colorMarkings ?? null,
    p_microchip_number: input.data.microchipNumber ?? null,
    p_neutered: input.data.neutered ?? null,
  });
  if (error) redirect("/admin/customers?error=UNKNOWN");
  revalidatePath("/admin/customers");
  redirect("/admin/customers?success=pet_added");
}

function normalizePhone(value: string): string {
  return value.replace(/[^0-9+]/g, "");
}

function emptyToUndefined(
  value: FormDataEntryValue | null,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean.length > 0 ? clean : undefined;
}
