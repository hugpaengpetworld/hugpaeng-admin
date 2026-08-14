import "server-only";

import { requireTenantContext } from "@/data/auth/tenant-context";
import type { SterilizationStatus } from "@/domain/sterilization/rules";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SterilizationAppointment {
  readonly id: string;
  readonly appointmentCode: string;
  readonly appointmentDate: string;
  readonly appointmentTime: string;
  readonly customerName: string;
  readonly phone: string;
  readonly petName: string;
  readonly species: "CAT" | "DOG" | "OTHER";
  readonly customSpecies: string | null;
  readonly sex: "MALE" | "FEMALE";
  readonly breed: string | null;
  readonly weightKg: number | null;
  readonly ageText: string | null;
  readonly vaccinationStatus: string | null;
  readonly sourceChannel: "FACEBOOK" | "PHONE" | "WALK_IN" | "OTHER";
  readonly status: SterilizationStatus;
  readonly notes: string | null;
  readonly overbookAcknowledged: boolean;
  readonly holidayOverride: boolean;
}

export interface SterilizationHoliday {
  readonly id: string;
  readonly holidayDate: string;
  readonly reason: string;
  readonly isActive: boolean;
}

interface AppointmentRow {
  readonly id: string;
  readonly appointment_code: string;
  readonly appointment_date: string;
  readonly appointment_time: string;
  readonly customer_name: string;
  readonly phone: string;
  readonly pet_name: string;
  readonly species: "CAT" | "DOG" | "OTHER";
  readonly custom_species: string | null;
  readonly sex: "MALE" | "FEMALE";
  readonly breed: string | null;
  readonly weight_kg: number | string | null;
  readonly age_text: string | null;
  readonly vaccination_status: string | null;
  readonly source_channel: "FACEBOOK" | "PHONE" | "WALK_IN" | "OTHER";
  readonly status: SterilizationStatus;
  readonly notes: string | null;
  readonly overbook_acknowledged: boolean;
  readonly holiday_override: boolean;
}

interface HolidayRow {
  readonly id: string;
  readonly holiday_date: string;
  readonly reason: string;
  readonly is_active: boolean;
}

const appointmentColumns =
  "id, appointment_code, appointment_date, appointment_time, customer_name, phone, pet_name, species, custom_species, sex, breed, weight_kg, age_text, vaccination_status, source_channel, status, notes, overbook_acknowledged, holiday_override";

export async function listSterilizationAppointments(filters?: {
  readonly month?: string;
  readonly date?: string;
  readonly status?: SterilizationStatus;
}): Promise<readonly SterilizationAppointment[]> {
  const context = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("sterilization_appointments")
    .select(appointmentColumns)
    .eq("tenant_id", context.tenantId)
    .order("appointment_date", { ascending: true })
    .order("appointment_time", { ascending: true })
    .limit(500);

  if (filters?.month && /^\d{4}-\d{2}$/.test(filters.month)) {
    const { start, end } = monthRange(filters.month);
    query = query.gte("appointment_date", start).lt("appointment_date", end);
  }
  if (filters?.date) query = query.eq("appointment_date", filters.date);
  if (filters?.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throw new Error("STERILIZATION_LIST_UNAVAILABLE");
  return ((data ?? []) as AppointmentRow[]).map(mapAppointment);
}

export async function listSterilizationHolidays(
  month: string,
): Promise<readonly SterilizationHoliday[]> {
  const context = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const { start, end } = monthRange(month);
  const { data, error } = await supabase
    .from("sterilization_holidays")
    .select("id, holiday_date, reason, is_active")
    .eq("tenant_id", context.tenantId)
    .gte("holiday_date", start)
    .lt("holiday_date", end)
    .order("holiday_date", { ascending: true });
  if (error) throw new Error("STERILIZATION_HOLIDAYS_UNAVAILABLE");
  return ((data ?? []) as HolidayRow[]).map((row) => ({
    id: row.id,
    holidayDate: row.holiday_date,
    reason: row.reason,
    isActive: row.is_active,
  }));
}

function mapAppointment(row: AppointmentRow): SterilizationAppointment {
  return {
    id: row.id,
    appointmentCode: row.appointment_code,
    appointmentDate: row.appointment_date,
    appointmentTime: row.appointment_time.slice(0, 5),
    customerName: row.customer_name,
    phone: row.phone,
    petName: row.pet_name,
    species: row.species,
    customSpecies: row.custom_species,
    sex: row.sex,
    breed: row.breed,
    weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
    ageText: row.age_text,
    vaccinationStatus: row.vaccination_status,
    sourceChannel: row.source_channel,
    status: row.status,
    notes: row.notes,
    overbookAcknowledged: row.overbook_acknowledged,
    holidayOverride: row.holiday_override,
  };
}

function monthRange(month: string): {
  readonly start: string;
  readonly end: string;
} {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("INVALID_MONTH");
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const endDate = new Date(Date.UTC(year, monthIndex + 1, 1));
  return {
    start: `${month}-01`,
    end: `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, "0")}-01`,
  };
}
