import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface BookingListPet {
  readonly name: string;
  readonly species: "CAT" | "DOG";
  readonly weightKg: number | null;
}

export interface BookingListUnit {
  readonly id: string;
  readonly bookingCode: string;
  readonly species: "CAT" | "DOG";
  readonly status: string;
  readonly paymentStatus: string;
  readonly version: number;
  readonly roomCode: string;
  readonly lodgingTotalSatang: number;
  readonly depositDeadlineAt: string | null;
  readonly paymentId: string | null;
  readonly evidenceUrl: string | null;
  readonly pets: readonly BookingListPet[];
}

export interface BookingListGroup {
  readonly id: string;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly channel: string;
  readonly checkInDate: string;
  readonly checkOutDate: string;
  readonly createdAt: string;
  readonly units: readonly BookingListUnit[];
}

interface RawGroup {
  id: string;
  channel: string;
  check_in_date: string;
  check_out_date: string;
  created_at: string;
  customers: { full_name: string; phone: string } | null;
  bookings: Array<{
    id: string;
    booking_code: string | null;
    species: "CAT" | "DOG";
    status: string;
    payment_status: string;
    version: number;
    lodging_total_satang: number;
    deposit_deadline_at: string | null;
    room_inventory: { room_code: string } | null;
    booking_pets: Array<{
      position: number;
      pets: {
        name: string;
        species: "CAT" | "DOG";
        weight_kg: number | null;
      } | null;
    }>;
  }>;
}

export async function listBookingGroups(): Promise<BookingListGroup[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("booking_groups")
    .select(
      `
        id, channel, check_in_date, check_out_date, created_at,
        customers!inner(full_name, phone),
        bookings!inner(
          id, booking_code, species, status, payment_status, version,
          lodging_total_satang, deposit_deadline_at,
          room_inventory(room_code),
          booking_pets(position, pets(name, species, weight_kg))
        )
      `,
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("BOOKING_LIST_FAILED");

  const rawGroups = (data ?? []) as unknown as RawGroup[];
  const groupIds = rawGroups.map(({ id }) => id);
  const paymentsByGroup = new Map<
    string,
    { id: string; evidenceUrl: string | null }
  >();
  if (groupIds.length > 0) {
    const { data: payments, error: paymentError } = await supabase
      .from("payments")
      .select("id, booking_group_id, evidence_asset_id")
      .eq("payment_type", "DEPOSIT")
      .in("booking_group_id", groupIds);
    if (paymentError) throw new Error("BOOKING_LIST_FAILED");
    const assetIds = (payments ?? []).flatMap(({ evidence_asset_id }) =>
      evidence_asset_id ? [evidence_asset_id] : [],
    );
    const assetPaths = new Map<string, string>();
    if (assetIds.length > 0) {
      const { data: assets, error: assetError } = await supabase
        .from("file_assets")
        .select("id, storage_path")
        .in("id", assetIds);
      if (assetError) throw new Error("BOOKING_LIST_FAILED");
      for (const asset of assets ?? [])
        assetPaths.set(asset.id, asset.storage_path);
    }
    await Promise.all(
      (payments ?? []).map(async (payment) => {
        const path = payment.evidence_asset_id
          ? assetPaths.get(payment.evidence_asset_id)
          : undefined;
        let evidenceUrl: string | null = null;
        if (path) {
          const { data: signed } = await supabase.storage
            .from("tenant-assets")
            .createSignedUrl(path, 300);
          evidenceUrl = signed?.signedUrl ?? null;
        }
        paymentsByGroup.set(payment.booking_group_id, {
          id: payment.id,
          evidenceUrl,
        });
      }),
    );
  }

  return rawGroups.map((group) => ({
    id: group.id,
    customerName: group.customers?.full_name ?? "—",
    customerPhone: group.customers?.phone ?? "—",
    channel: group.channel,
    checkInDate: group.check_in_date,
    checkOutDate: group.check_out_date,
    createdAt: group.created_at,
    units: group.bookings.map((unit) => ({
      id: unit.id,
      bookingCode: unit.booking_code ?? "กำลังสร้างรหัส",
      species: unit.species,
      status: unit.status,
      paymentStatus: unit.payment_status,
      version: unit.version,
      roomCode: unit.room_inventory?.room_code ?? "—",
      lodgingTotalSatang: unit.lodging_total_satang,
      depositDeadlineAt: unit.deposit_deadline_at,
      paymentId: paymentsByGroup.get(group.id)?.id ?? null,
      evidenceUrl: paymentsByGroup.get(group.id)?.evidenceUrl ?? null,
      pets: unit.booking_pets
        .toSorted((left, right) => left.position - right.position)
        .flatMap(({ pets }) =>
          pets
            ? [
                {
                  name: pets.name,
                  species: pets.species,
                  weightKg: pets.weight_kg,
                },
              ]
            : [],
        ),
    })),
  }));
}

export interface PendingReschedule {
  readonly id: string;
  readonly customerName: string;
  readonly oldCheckInDate: string;
  readonly oldCheckOutDate: string;
  readonly newCheckInDate: string;
  readonly newCheckOutDate: string;
  readonly reason: string | null;
}

export async function listPendingReschedules(): Promise<PendingReschedule[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reschedule_requests")
    .select(
      `id, old_check_in_date, old_check_out_date, new_check_in_date, new_check_out_date,
       customer_reason, booking_groups!inner(customers!inner(full_name))`,
    )
    .eq("status", "PENDING")
    .order("requested_at", { ascending: true });
  if (error) throw new Error("RESCHEDULE_LIST_FAILED");
  return (data ?? []).map((row) => {
    const group = row.booking_groups as unknown as {
      customers: { full_name: string };
    };
    return {
      id: row.id,
      customerName: group.customers.full_name,
      oldCheckInDate: row.old_check_in_date,
      oldCheckOutDate: row.old_check_out_date,
      newCheckInDate: row.new_check_in_date,
      newCheckOutDate: row.new_check_out_date,
      reason: row.customer_reason,
    };
  });
}
