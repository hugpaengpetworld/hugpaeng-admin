import { describe, expect, it } from "vitest";

import {
  createDepositDeadline,
  isDepositDeadlineExpired,
  LINE_DEPOSIT_SATANG,
  requiredLineDepositSatang,
} from "./deposit";

describe("LINE deposit policy", () => {
  it("uses a 500 THB deposit and exactly one-hour deadline", () => {
    const approved = new Date("2026-08-05T03:15:00.000Z");
    expect(LINE_DEPOSIT_SATANG).toBe(50_000);
    expect(createDepositDeadline(approved).toISOString()).toBe(
      "2026-08-05T04:15:00.000Z",
    );
  });

  it("treats the exact deadline as expired", () => {
    const deadline = new Date("2026-08-05T04:15:00.000Z");
    expect(
      isDepositDeadlineExpired(deadline, new Date("2026-08-05T04:14:59.999Z")),
    ).toBe(false);
    expect(isDepositDeadlineExpired(deadline, deadline)).toBe(true);
  });

  it("charges 500 THB once for a booking group regardless of room count", () => {
    expect(requiredLineDepositSatang(1)).toBe(50_000);
    expect(requiredLineDepositSatang(2)).toBe(50_000);
    expect(requiredLineDepositSatang(10)).toBe(50_000);
    expect(() => requiredLineDepositSatang(0)).toThrow(
      "INVALID_ROOM_UNIT_COUNT",
    );
  });
});
