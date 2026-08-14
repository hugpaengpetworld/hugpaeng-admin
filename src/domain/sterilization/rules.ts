import { z } from "zod";

import { isIsoDate } from "@/domain/shared/date";

export const STERILIZATION_DAILY_CAPACITY = 4;

export const sterilizationStatusSchema = z.enum([
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "ARRIVED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);

export type SterilizationStatus = z.infer<typeof sterilizationStatusSchema>;
export type SterilizationCapacityTone = "AVAILABLE" | "FULL" | "OVERBOOKED";

export const ACTIVE_STERILIZATION_STATUSES: ReadonlySet<SterilizationStatus> =
  new Set(["PENDING_CONFIRMATION", "CONFIRMED", "ARRIVED"]);

export const STERILIZATION_STATUS_LABELS: Readonly<
  Record<SterilizationStatus, string>
> = {
  PENDING_CONFIRMATION: "รอยืนยันนัด",
  CONFIRMED: "ยืนยันนัดแล้ว",
  ARRIVED: "มาถึงคลินิกแล้ว",
  COMPLETED: "ดำเนินการเสร็จแล้ว",
  CANCELLED: "ยกเลิก",
  NO_SHOW: "ไม่มาตามนัด",
};

export const STERILIZATION_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  VALIDATION_ERROR: "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง",
  STERILIZATION_HOLIDAY:
    "วันที่เลือกเป็นวันหยุด ต้องให้เจ้าของหรือสัตวแพทย์ยืนยันข้อยกเว้น",
  HOLIDAY_OVERRIDE_FORBIDDEN: "บัญชีนี้ไม่มีสิทธิ์รับนัดในวันหยุด",
  OVERBOOK_ACKNOWLEDGEMENT_REQUIRED: "คิวครบ 4 ตัวแล้ว ต้องยืนยันการ overbook",
  INVALID_STATUS_TRANSITION: "ไม่สามารถเปลี่ยนไปยังสถานะที่เลือกได้",
  APPOINTMENT_DATE_IN_PAST: "ไม่สามารถสร้างนัดย้อนหลังได้",
  FORBIDDEN: "ไม่มีสิทธิ์ดำเนินการ",
  PET_SEX_REQUIRED:
    "ทะเบียนสัตว์ยังไม่มีข้อมูลเพศ กรุณาเพิ่มข้อมูลก่อนสร้างนัดทำหมัน",
  UNKNOWN: "ดำเนินการไม่สำเร็จ กรุณาลองใหม่",
};

export function sterilizationErrorMessage(code: string): string {
  return (
    STERILIZATION_ERROR_MESSAGES[code] ?? STERILIZATION_ERROR_MESSAGES.UNKNOWN!
  );
}

export function nextSterilizationStatuses(
  status: SterilizationStatus,
): readonly SterilizationStatus[] {
  const transitions: Readonly<
    Record<SterilizationStatus, readonly SterilizationStatus[]>
  > = {
    PENDING_CONFIRMATION: ["CONFIRMED", "CANCELLED", "NO_SHOW"],
    CONFIRMED: ["ARRIVED", "CANCELLED", "NO_SHOW"],
    ARRIVED: ["COMPLETED", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
    NO_SHOW: [],
  };
  return transitions[status];
}

export const sterilizationAppointmentSchema = z
  .object({
    customerId: z.uuid().optional(),
    petId: z.uuid().optional(),
    appointmentDate: z.string().refine(isIsoDate),
    appointmentTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    customerName: z.string().trim().min(1).max(120),
    phone: z
      .string()
      .trim()
      .transform((value) => value.replace(/[^0-9+]/g, ""))
      .refine((value) => /^\+?[0-9]{8,15}$/.test(value)),
    petName: z.string().trim().min(1).max(100),
    species: z.enum(["CAT", "DOG", "OTHER"]),
    customSpecies: z.string().trim().max(50).optional(),
    sex: z.enum(["MALE", "FEMALE"]),
    breed: z.string().trim().max(100).optional(),
    weightKg: z.number().positive().max(999.99).optional(),
    ageText: z.string().trim().max(60).optional(),
    vaccinationStatus: z.string().trim().max(200).optional(),
    sourceChannel: z.enum(["FACEBOOK", "PHONE", "WALK_IN", "OTHER"]),
    notes: z.string().trim().max(1000).optional(),
    acknowledgeOverbook: z.boolean(),
    holidayOverride: z.boolean(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.customerId) !== Boolean(value.petId)) {
      context.addIssue({
        code: "custom",
        path: ["petId"],
        message: "REGISTRY_SELECTION_INCOMPLETE",
      });
    }
    if (value.species === "OTHER" && !value.customSpecies) {
      context.addIssue({
        code: "custom",
        path: ["customSpecies"],
        message: "CUSTOM_SPECIES_REQUIRED",
      });
    }
    if (value.species !== "OTHER" && value.customSpecies) {
      context.addIssue({
        code: "custom",
        path: ["customSpecies"],
        message: "CUSTOM_SPECIES_NOT_ALLOWED",
      });
    }
  });

export function sterilizationConsumesCapacity(
  status: SterilizationStatus,
): boolean {
  return ACTIVE_STERILIZATION_STATUSES.has(status);
}

export function getSterilizationCapacityTone(
  activeCount: number,
): SterilizationCapacityTone {
  if (!Number.isInteger(activeCount) || activeCount < 0) {
    throw new Error("INVALID_STERILIZATION_COUNT");
  }
  if (activeCount > STERILIZATION_DAILY_CAPACITY) return "OVERBOOKED";
  if (activeCount === STERILIZATION_DAILY_CAPACITY) return "FULL";
  return "AVAILABLE";
}

export function getSterilizationPetLabel(input: {
  readonly species: "CAT" | "DOG" | "OTHER";
  readonly petName: string;
  readonly sex: "MALE" | "FEMALE";
}): string {
  const prefix =
    input.species === "CAT" ? "F" : input.species === "DOG" ? "C" : "O";
  const sexLabel = input.sex === "MALE" ? "ผู้" : "เมีย";
  return `${prefix}-${input.petName}/${sexLabel}`;
}

export function canTransitionSterilizationStatus(
  from: SterilizationStatus,
  to: SterilizationStatus,
): boolean {
  return nextSterilizationStatuses(from).includes(to);
}
