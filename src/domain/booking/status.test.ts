import { describe, expect, it } from "vitest";

import {
  BOOKING_STATUSES,
  assertBookingTransition,
  canTransitionBooking,
} from "./status";

describe("booking status transitions", () => {
  it("matches the complete server-side allowlist", () => {
    const permitted = new Set([
      "PENDING_APPROVAL->APPROVED_AWAITING_DEPOSIT",
      "PENDING_APPROVAL->CONFIRMED",
      "PENDING_APPROVAL->REJECTED",
      "PENDING_APPROVAL->CANCELLED_NO_REFUND",
      "APPROVED_AWAITING_DEPOSIT->CONFIRMED",
      "APPROVED_AWAITING_DEPOSIT->EXPIRED_PAYMENT",
      "APPROVED_AWAITING_DEPOSIT->CANCELLED_NO_REFUND",
      "CONFIRMED->CHECKED_IN",
      "CONFIRMED->NO_SHOW",
      "CONFIRMED->CANCELLED_NO_REFUND",
      "CHECKED_IN->CHECKED_OUT",
    ]);

    for (const from of BOOKING_STATUSES) {
      for (const to of BOOKING_STATUSES) {
        const transition = `${from}->${to}`;
        expect(canTransitionBooking(from, to), transition).toBe(
          permitted.has(transition),
        );
        if (permitted.has(transition)) {
          expect(
            () => assertBookingTransition(from, to),
            transition,
          ).not.toThrow();
        } else {
          expect(() => assertBookingTransition(from, to), transition).toThrow(
            "INVALID_STATUS_TRANSITION",
          );
        }
      }
    }
  });
});
