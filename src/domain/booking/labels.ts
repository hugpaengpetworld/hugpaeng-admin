import type { BookingStatus } from "./status";

export const BOOKING_STATUS_LABELS: Readonly<Record<BookingStatus, string>> = {
  PENDING_APPROVAL: "รอตรวจสอบคำขอ",
  APPROVED_AWAITING_DEPOSIT: "รอชำระมัดจำ",
  CONFIRMED: "ยืนยันการจองแล้ว",
  CHECKED_IN: "กำลังเข้าพัก",
  CHECKED_OUT: "เช็กเอาต์แล้ว",
  REJECTED: "ไม่อนุมัติ",
  EXPIRED_PAYMENT: "หมดเวลาชำระ",
  CANCELLED_NO_REFUND: "ยกเลิกโดยไม่คืนมัดจำ",
  NO_SHOW: "ไม่มาตามนัด",
};

export const CHANNEL_LABELS = {
  WEBSITE: "เว็บไซต์",
  LINE: "LINE",
  FACEBOOK: "Facebook",
  PHONE: "โทรศัพท์",
  WALK_IN: "หน้าคลินิก",
  OTHER: "ช่องทางอื่น",
} as const;
