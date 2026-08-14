export const clinicRoles = [
  "OWNER",
  "ADMIN",
  "DOCTOR",
  "STAFF",
  "COUNTER",
  "ASSISTANT",
] as const;

export type ClinicRole = (typeof clinicRoles)[number];

export const tenantPermissions = [
  "CUSTOMERS_READ",
  "CUSTOMERS_WRITE",
  "PETS_READ",
  "PETS_WRITE",
  "BOOKINGS_READ",
  "BOOKINGS_WRITE",
  "CHECK_IN",
  "CHECK_OUT",
  "ROOM_STATE_MANAGE",
  "ROOM_INVENTORY_MANAGE",
  "STERILIZATION_READ",
  "STERILIZATION_WRITE",
  "STERILIZATION_HOLIDAY_MANAGE",
  "HEALTH_READ",
  "HEALTH_WRITE",
  "PAYMENTS_COLLECT",
  "PAYMENTS_VERIFY",
  "REFUNDS_MANAGE",
  "RECEIPTS_MANAGE",
  "SETTINGS_MANAGE",
  "USERS_MANAGE",
  "AUDIT_READ",
] as const;

export type TenantPermission = (typeof tenantPermissions)[number];

export const roleLabels: Readonly<Record<ClinicRole, string>> = {
  OWNER: "เจ้าของคลินิก",
  ADMIN: "ผู้ดูแลระบบคลินิก",
  DOCTOR: "สัตวแพทย์",
  STAFF: "พนักงาน",
  COUNTER: "เคาน์เตอร์",
  ASSISTANT: "ผู้ช่วยสัตวแพทย์",
};

export const permissionLabels: Readonly<Record<TenantPermission, string>> = {
  CUSTOMERS_READ: "ดูทะเบียนลูกค้า",
  CUSTOMERS_WRITE: "จัดการทะเบียนลูกค้า",
  PETS_READ: "ดูทะเบียนสัตว์เลี้ยง",
  PETS_WRITE: "จัดการทะเบียนสัตว์เลี้ยง",
  BOOKINGS_READ: "ดูรายการจอง",
  BOOKINGS_WRITE: "จัดการรายการจอง",
  CHECK_IN: "เช็กอิน",
  CHECK_OUT: "เช็กเอาต์",
  ROOM_STATE_MANAGE: "จัดการสถานะห้อง",
  ROOM_INVENTORY_MANAGE: "เพิ่มหรือลดห้อง",
  STERILIZATION_READ: "ดูคิวทำหมัน",
  STERILIZATION_WRITE: "จัดการคิวทำหมัน",
  STERILIZATION_HOLIDAY_MANAGE: "จัดการวันหยุดทำหมัน",
  HEALTH_READ: "ดูข้อมูลสุขภาพ",
  HEALTH_WRITE: "บันทึกข้อมูลสุขภาพ",
  PAYMENTS_COLLECT: "รับชำระเงิน",
  PAYMENTS_VERIFY: "ตรวจสอบการชำระเงิน",
  REFUNDS_MANAGE: "จัดการคืนเงิน",
  RECEIPTS_MANAGE: "จัดการใบเสร็จ",
  SETTINGS_MANAGE: "ตั้งค่าคลินิก",
  USERS_MANAGE: "จัดการผู้ใช้งาน",
  AUDIT_READ: "ดูประวัติการตรวจสอบ",
};

export function isClinicRole(value: unknown): value is ClinicRole {
  return clinicRoles.includes(value as ClinicRole);
}

export function isTenantPermission(value: unknown): value is TenantPermission {
  return tenantPermissions.includes(value as TenantPermission);
}
