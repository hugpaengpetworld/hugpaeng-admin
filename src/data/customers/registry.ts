import "server-only";

import { requireTenantContext } from "@/data/auth/tenant-context";
import type { TenantPermission } from "@/domain/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface RegistryPet {
  readonly id: string;
  readonly hn: string;
  readonly name: string;
  readonly species: "CAT" | "DOG";
  readonly sex: "MALE" | "FEMALE" | null;
  readonly breed: string | null;
  readonly weightKg: number | null;
  readonly dateOfBirth: string | null;
  readonly ageText: string | null;
  readonly colorMarkings: string | null;
  readonly microchipNumber: string | null;
  readonly neutered: boolean | null;
}

export interface RegistryCustomer {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly email: string | null;
  readonly address: string | null;
  readonly pets: readonly RegistryPet[];
}

interface RegistryRow {
  readonly customer_id: string;
  readonly customer_name: string;
  readonly phone: string;
  readonly email: string | null;
  readonly address: string | null;
  readonly pets: readonly RegistryPet[];
}

export async function searchPatientRegistry(
  query: string,
): Promise<readonly RegistryCustomer[]> {
  const context = await requireTenantContext();
  assertPermission(context.permissions, "CUSTOMERS_READ");
  assertPermission(context.permissions, "PETS_READ");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_patient_registry", {
    p_tenant_id: context.tenantId,
    p_query: query,
  });
  if (error) throw new Error("REGISTRY_SEARCH_FAILED");
  return ((data ?? []) as RegistryRow[]).map((row) => ({
    id: row.customer_id,
    name: row.customer_name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    pets: row.pets,
  }));
}

export async function getRegistrySelection(
  customerId: string,
  petIds: readonly string[],
): Promise<RegistryCustomer | null> {
  const context = await requireTenantContext();
  assertPermission(context.permissions, "CUSTOMERS_READ");
  assertPermission(context.permissions, "PETS_READ");
  const supabase = await createSupabaseServerClient();
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, full_name, phone, email, address")
    .eq("tenant_id", context.tenantId)
    .eq("id", customerId)
    .is("archived_at", null)
    .maybeSingle();
  if (customerError || !customer) return null;
  const { data: pets, error: petsError } = await supabase
    .from("pets")
    .select(
      "id, hn, name, species, sex, breed, weight_kg, date_of_birth, age_text, color_markings, microchip_number, neutered",
    )
    .eq("tenant_id", context.tenantId)
    .eq("customer_id", customerId)
    .in("id", [...petIds])
    .is("archived_at", null);
  if (petsError) return null;
  return {
    id: customer.id,
    name: customer.full_name,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    pets: (pets ?? []).map((pet) => ({
      id: pet.id,
      hn: pet.hn,
      name: pet.name,
      species: pet.species,
      sex: pet.sex,
      breed: pet.breed,
      weightKg: pet.weight_kg,
      dateOfBirth: pet.date_of_birth,
      ageText: pet.age_text,
      colorMarkings: pet.color_markings,
      microchipNumber: pet.microchip_number,
      neutered: pet.neutered,
    })),
  };
}

function assertPermission(
  permissions: readonly TenantPermission[],
  permission: TenantPermission,
): void {
  if (!permissions.includes(permission)) throw new Error("FORBIDDEN");
}
