import "server-only";

import {
  getCheckoutTiming,
  type CheckoutTiming,
} from "@/domain/boarding/operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface EligibleRoom {
  readonly id: string;
  readonly code: string;
}

export interface OperationalBooking {
  readonly id: string;
  readonly bookingGroupId: string;
  readonly bookingCode: string;
  readonly status: "CONFIRMED" | "CHECKED_IN";
  readonly version: number;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly species: "CAT" | "DOG";
  readonly petLabels: readonly string[];
  readonly plannedCheckInDate: string;
  readonly plannedCheckOutDate: string;
  readonly roomId: string | null;
  readonly roomCode: string;
  readonly lodgingTotalSatang: number;
  readonly groupLodgingTotalSatang: number;
  readonly groupExtraChargesSatang: number;
  readonly verifiedDepositSatang: number;
  readonly finalGroupCheckout: boolean;
  readonly checkedInAt: string | null;
  readonly checkoutTiming: CheckoutTiming | null;
  readonly eligibleRooms: readonly EligibleRoom[];
}

interface RawBooking {
  id: string;
  booking_code: string | null;
  status: "CONFIRMED" | "CHECKED_IN";
  version: number;
  species: "CAT" | "DOG";
  room_id: string | null;
  lodging_total_satang: number;
  booking_groups: {
    id: string;
    check_in_date: string;
    check_out_date: string;
    customers: { full_name: string; phone: string };
  };
  room_inventory: { room_code: string } | null;
  booking_pets: Array<{
    position: number;
    pets: { name: string; species: "CAT" | "DOG" } | null;
  }>;
  room_stays: Array<{
    checked_in_at: string;
    checked_out_at: string | null;
    deposit_satang: number;
  }>;
}

export async function listOperationalBookings(
  tenantId: string,
  options?: { readonly bookingIds?: readonly string[] },
): Promise<OperationalBooking[]> {
  if (options?.bookingIds && options.bookingIds.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("bookings")
    .select(
      `id, booking_code, status, version, species, room_id, lodging_total_satang,
       booking_groups!inner(id, check_in_date, check_out_date, customers!inner(full_name, phone)),
       room_inventory(room_code),
       booking_pets(position, pets(name, species)),
       room_stays(checked_in_at, checked_out_at, deposit_satang)`,
    )
    .eq("tenant_id", tenantId)
    .in("status", ["CONFIRMED", "CHECKED_IN"])
    .order("updated_at", { ascending: true })
    .limit(200);
  if (options?.bookingIds) {
    query = query.in("id", [...new Set(options.bookingIds)]);
  }
  const { data, error } = await query;
  if (error) throw new Error("OPERATIONS_LIST_FAILED");

  const rawBookings = (data ?? []) as unknown as RawBooking[];
  const groupIds = [
    ...new Set(rawBookings.map(({ booking_groups }) => booking_groups.id)),
  ];
  const [paymentsResult, groupBookingsResult] = await Promise.all([
    groupIds.length
      ? supabase
          .from("payments")
          .select("booking_group_id, payment_type, status, amount_satang")
          .eq("payment_type", "DEPOSIT")
          .eq("status", "VERIFIED")
          .in("booking_group_id", groupIds)
      : Promise.resolve({ data: [], error: null }),
    groupIds.length
      ? supabase
          .from("bookings")
          .select("id, booking_group_id, status, lodging_total_satang")
          .in("booking_group_id", groupIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (paymentsResult.error || groupBookingsResult.error) {
    throw new Error("OPERATIONS_LIST_FAILED");
  }
  const groupBookingRows = groupBookingsResult.data ?? [];
  const groupBookingIds = groupBookingRows.map(({ id }) => id);
  const chargesResult = groupBookingIds.length
    ? await supabase
        .from("booking_charges")
        .select("booking_id, amount_satang")
        .in("booking_id", groupBookingIds)
    : { data: [], error: null };
  if (chargesResult.error) throw new Error("OPERATIONS_LIST_FAILED");

  const depositsByGroup = new Map(
    (paymentsResult.data ?? []).map((payment) => [
      payment.booking_group_id,
      payment.amount_satang,
    ]),
  );
  const groupByBookingId = new Map(
    groupBookingRows.map((booking) => [booking.id, booking.booking_group_id]),
  );
  const chargesByGroup = new Map<string, number>();
  for (const charge of chargesResult.data ?? []) {
    const groupId = groupByBookingId.get(charge.booking_id);
    if (groupId) {
      chargesByGroup.set(
        groupId,
        (chargesByGroup.get(groupId) ?? 0) + charge.amount_satang,
      );
    }
  }
  const blockingGroupStatuses = new Set([
    "PENDING_APPROVAL",
    "APPROVED_AWAITING_DEPOSIT",
    "CONFIRMED",
    "CHECKED_IN",
  ]);
  const billableGroupStatuses = new Set([
    "CONFIRMED",
    "CHECKED_IN",
    "CHECKED_OUT",
  ]);

  return Promise.all(
    rawBookings.map(async (booking) => {
      const group = booking.booking_groups;
      const openStay = booking.room_stays.find(
        ({ checked_out_at }) => checked_out_at === null,
      );
      const groupedBookings = groupBookingRows.filter(
        ({ booking_group_id }) => booking_group_id === group.id,
      );
      const groupLodgingTotalSatang = groupedBookings
        .filter(({ status }) => billableGroupStatuses.has(status))
        .reduce((sum, unit) => sum + unit.lodging_total_satang, 0);
      const activeGroupUnits = groupedBookings.filter(({ status }) =>
        blockingGroupStatuses.has(status),
      ).length;
      let eligibleRooms: EligibleRoom[] = [];
      if (booking.status === "CONFIRMED") {
        const { data: rooms, error: roomsError } = await supabase.rpc(
          "get_eligible_rooms",
          {
            p_tenant_id: tenantId,
            p_species: booking.species,
            p_check_in_date: group.check_in_date,
            p_check_out_date: group.check_out_date,
            p_exclude_booking_id: booking.id,
          },
        );
        if (roomsError) throw new Error("ELIGIBLE_ROOMS_FAILED");
        eligibleRooms = (rooms ?? []).map(
          (room: { room_id: string; room_code: string }) => ({
            id: room.room_id,
            code: room.room_code,
          }),
        );
      }

      return {
        id: booking.id,
        bookingGroupId: group.id,
        bookingCode: booking.booking_code ?? "กำลังสร้างรหัส",
        status: booking.status,
        version: booking.version,
        customerName: group.customers.full_name,
        customerPhone: group.customers.phone,
        species: booking.species,
        petLabels: booking.booking_pets
          .toSorted((left, right) => left.position - right.position)
          .flatMap(({ pets }) =>
            pets
              ? [`${pets.name} (${pets.species === "CAT" ? "แมว" : "สุนัข"})`]
              : [],
          ),
        plannedCheckInDate: group.check_in_date,
        plannedCheckOutDate: group.check_out_date,
        roomId: booking.room_id,
        roomCode: booking.room_inventory?.room_code ?? "—",
        lodgingTotalSatang: booking.lodging_total_satang,
        groupLodgingTotalSatang,
        groupExtraChargesSatang: chargesByGroup.get(group.id) ?? 0,
        verifiedDepositSatang: depositsByGroup.get(group.id) ?? 0,
        finalGroupCheckout:
          booking.status === "CHECKED_IN" && activeGroupUnits === 1,
        checkedInAt: openStay?.checked_in_at ?? null,
        checkoutTiming:
          booking.status === "CHECKED_IN"
            ? getCheckoutTiming(group.check_out_date)
            : null,
        eligibleRooms,
      };
    }),
  );
}
