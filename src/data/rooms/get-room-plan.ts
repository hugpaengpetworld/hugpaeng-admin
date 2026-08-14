import "server-only";

import type {
  RoomDisplayStatus,
  RoomOperationalStatus,
} from "@/domain/rooms/status";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RoomSpecies = "CAT" | "DOG";

export interface RoomPlanItem {
  readonly room_id: string;
  readonly room_code: string;
  readonly species: RoomSpecies;
  readonly operational_status: RoomOperationalStatus;
  readonly version: number;
  readonly display_status: RoomDisplayStatus;
  readonly booking_id: string | null;
  readonly booking_code: string | null;
  readonly pet_names: string[];
  readonly planned_check_in: string | null;
  readonly planned_check_out: string | null;
  readonly checked_in_at: string | null;
}

export interface RoomBookingQuickPet {
  readonly id: string;
  readonly name: string;
  readonly species: RoomSpecies;
  readonly weightKg: number | null;
  readonly fleaTickTreated: boolean | null;
  readonly fleaTickProduct: string | null;
  readonly fleaTickTreatedOn: string | null;
  readonly healthReviewNotes: string | null;
}

export interface RoomBookingQuickDetail {
  readonly bookingId: string;
  readonly bookingCode: string;
  readonly bookingStatus: string;
  readonly bookingVersion: number;
  readonly paymentStatus: string;
  readonly verifiedDepositSatang: number;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly channel: string;
  readonly checkInDate: string;
  readonly checkOutDate: string;
  readonly customerNotes: string | null;
  readonly bookingNotes: string | null;
  readonly pets: readonly RoomBookingQuickPet[];
}

interface QuickBookingRow {
  readonly id: string;
  readonly booking_code: string | null;
  readonly status: string;
  readonly version: number;
  readonly payment_status: string;
  readonly notes: string | null;
  readonly booking_groups: {
    readonly id: string;
    readonly channel: string;
    readonly check_in_date: string;
    readonly check_out_date: string;
    readonly customer_notes: string | null;
    readonly customers: {
      readonly full_name: string;
      readonly phone: string;
    };
  };
  readonly booking_pets: readonly {
    readonly position: number;
    readonly pet_id: string;
    readonly pets: {
      readonly id: string;
      readonly name: string;
      readonly species: RoomSpecies;
      readonly weight_kg: number | string | null;
    };
  }[];
}

interface PetHealthRow {
  readonly pet_id: string;
  readonly flea_tick_treated: boolean | null;
  readonly flea_tick_product: string | null;
  readonly flea_tick_treated_on: string | null;
  readonly review_notes: string | null;
}

export async function getRoomPlan(input: {
  readonly tenantId: string;
  readonly species: RoomSpecies;
  readonly planDate: string;
}): Promise<readonly RoomPlanItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_room_plan", {
    p_tenant_id: input.tenantId,
    p_species: input.species,
    p_plan_date: input.planDate,
  });
  if (error) throw new Error("ROOM_PLAN_UNAVAILABLE");
  return (data ?? []) as RoomPlanItem[];
}

export async function getRoomBookingQuickDetails(input: {
  readonly tenantId: string;
  readonly bookingIds: readonly string[];
}): Promise<readonly RoomBookingQuickDetail[]> {
  if (input.bookingIds.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `id, booking_code, status, version, payment_status, notes,
       booking_groups!inner(id, channel, check_in_date, check_out_date, customer_notes,
         customers!inner(full_name, phone)),
       booking_pets(position, pet_id, pets!inner(id, name, species, weight_kg))`,
    )
    .eq("tenant_id", input.tenantId)
    .in("id", [...new Set(input.bookingIds)]);
  if (error) throw new Error("ROOM_BOOKING_DETAILS_UNAVAILABLE");

  const rows = (data ?? []) as unknown as QuickBookingRow[];
  const groupIds = [...new Set(rows.map((row) => row.booking_groups.id))];
  const verifiedDepositsByGroup = new Map<string, number>();
  if (groupIds.length > 0) {
    const { data: deposits, error: depositError } = await supabase
      .from("payments")
      .select("booking_group_id, amount_satang")
      .eq("payment_type", "DEPOSIT")
      .eq("status", "VERIFIED")
      .in("booking_group_id", groupIds);
    if (depositError) throw new Error("ROOM_BOOKING_DETAILS_UNAVAILABLE");
    for (const deposit of deposits ?? []) {
      verifiedDepositsByGroup.set(
        deposit.booking_group_id,
        deposit.amount_satang,
      );
    }
  }
  const petIds = rows.flatMap((row) =>
    row.booking_pets.map((bookingPet) => bookingPet.pet_id),
  );
  const healthByPet = new Map<string, PetHealthRow>();
  if (petIds.length > 0) {
    const { data: healthRows, error: healthError } = await supabase
      .from("pet_health_profiles")
      .select(
        "pet_id, flea_tick_treated, flea_tick_product, flea_tick_treated_on, review_notes",
      )
      .eq("tenant_id", input.tenantId)
      .in("pet_id", [...new Set(petIds)]);
    if (healthError) throw new Error("ROOM_BOOKING_DETAILS_UNAVAILABLE");
    for (const health of (healthRows ?? []) as PetHealthRow[]) {
      healthByPet.set(health.pet_id, health);
    }
  }

  return rows.map((row) => {
    const group = row.booking_groups;
    return {
      bookingId: row.id,
      bookingCode: row.booking_code ?? "กำลังสร้างรหัส",
      bookingStatus: row.status,
      bookingVersion: row.version,
      paymentStatus: row.payment_status,
      verifiedDepositSatang: verifiedDepositsByGroup.get(group.id) ?? 0,
      customerName: group.customers.full_name,
      customerPhone: group.customers.phone,
      channel: group.channel,
      checkInDate: group.check_in_date,
      checkOutDate: group.check_out_date,
      customerNotes: group.customer_notes,
      bookingNotes: row.notes,
      pets: row.booking_pets
        .toSorted((left, right) => left.position - right.position)
        .map(({ pets }) => {
          const health = healthByPet.get(pets.id);
          return {
            id: pets.id,
            name: pets.name,
            species: pets.species,
            weightKg: pets.weight_kg === null ? null : Number(pets.weight_kg),
            fleaTickTreated: health?.flea_tick_treated ?? null,
            fleaTickProduct: health?.flea_tick_product ?? null,
            fleaTickTreatedOn: health?.flea_tick_treated_on ?? null,
            healthReviewNotes: health?.review_notes ?? null,
          };
        }),
    };
  });
}
