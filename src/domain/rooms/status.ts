export const ROOM_OPERATIONAL_STATUSES = [
  "AVAILABLE",
  "CLEANING",
  "MAINTENANCE",
  "DISABLED",
] as const;

export type RoomOperationalStatus = (typeof ROOM_OPERATIONAL_STATUSES)[number];
export type ActiveAllocationStatus = "HOLD" | "RESERVED" | null;
export type RoomDisplayStatus =
  | "AVAILABLE"
  | "PENDING"
  | "CONFIRMED"
  | "OCCUPIED"
  | "CLEANING"
  | "MAINTENANCE"
  | "DISABLED";

export function deriveRoomDisplayStatus(input: {
  readonly hasOpenStay: boolean;
  readonly operationalStatus: RoomOperationalStatus;
  readonly allocationStatus: ActiveAllocationStatus;
}): RoomDisplayStatus {
  if (input.hasOpenStay) return "OCCUPIED";
  if (input.operationalStatus !== "AVAILABLE") return input.operationalStatus;
  if (input.allocationStatus === "HOLD") return "PENDING";
  if (input.allocationStatus === "RESERVED") return "CONFIRMED";
  return "AVAILABLE";
}

export const ROOM_STATUS_LABELS: Readonly<Record<RoomDisplayStatus, string>> = {
  AVAILABLE: "ว่าง",
  PENDING: "รออนุมัติห้อง",
  CONFIRMED: "ยืนยันแล้ว",
  OCCUPIED: "กำลังเข้าพัก",
  CLEANING: "รอทำความสะอาด",
  MAINTENANCE: "ปิดซ่อมบำรุง",
  DISABLED: "ปิดใช้งาน",
};
