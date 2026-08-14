export const BOOKING_STATUSES = [
  "PENDING_APPROVAL",
  "APPROVED_AWAITING_DEPOSIT",
  "CONFIRMED",
  "CHECKED_IN",
  "CHECKED_OUT",
  "REJECTED",
  "EXPIRED_PAYMENT",
  "CANCELLED_NO_REFUND",
  "NO_SHOW",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

const allowedTransitions: Readonly<
  Record<BookingStatus, readonly BookingStatus[]>
> = {
  PENDING_APPROVAL: [
    "APPROVED_AWAITING_DEPOSIT",
    "CONFIRMED",
    "REJECTED",
    "CANCELLED_NO_REFUND",
  ],
  APPROVED_AWAITING_DEPOSIT: [
    "CONFIRMED",
    "EXPIRED_PAYMENT",
    "CANCELLED_NO_REFUND",
  ],
  CONFIRMED: ["CHECKED_IN", "NO_SHOW", "CANCELLED_NO_REFUND"],
  CHECKED_IN: ["CHECKED_OUT"],
  CHECKED_OUT: [],
  REJECTED: [],
  EXPIRED_PAYMENT: [],
  CANCELLED_NO_REFUND: [],
  NO_SHOW: [],
};

export function canTransitionBooking(
  from: BookingStatus,
  to: BookingStatus,
): boolean {
  return allowedTransitions[from].includes(to);
}

export function assertBookingTransition(
  from: BookingStatus,
  to: BookingStatus,
): void {
  if (!canTransitionBooking(from, to)) {
    throw new Error(`INVALID_STATUS_TRANSITION: ${from} -> ${to}`);
  }
}
