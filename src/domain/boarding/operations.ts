import { isIsoDate, todayInBangkok } from "@/domain/shared/date";

export type CheckoutTiming = "EARLY" | "DUE_TODAY" | "OVERDUE";

export function getCheckoutTiming(
  plannedCheckOutDate: string,
  now: Date = new Date(),
): CheckoutTiming {
  if (!isIsoDate(plannedCheckOutDate)) {
    throw new RangeError("วันที่เช็กเอาต์ไม่ถูกต้อง");
  }
  const today = todayInBangkok(now);
  if (plannedCheckOutDate > today) return "EARLY";
  if (plannedCheckOutDate === today) return "DUE_TODAY";
  return "OVERDUE";
}

export function requiresEarlyCheckoutConfirmation(
  plannedCheckOutDate: string,
  now: Date = new Date(),
): boolean {
  return getCheckoutTiming(plannedCheckOutDate, now) === "EARLY";
}
