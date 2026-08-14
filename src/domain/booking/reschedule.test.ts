import { describe, expect, it } from "vitest";

import { assertRescheduleAllowed } from "./reschedule";

describe("rescheduling policy", () => {
  it("accepts the first request with three full days of notice", () => {
    expect(() =>
      assertRescheduleAllowed({
        approvedRescheduleCount: 0,
        todayInBangkok: "2026-08-05",
        currentCheckInDate: "2026-08-08",
        newCheckInDate: "2026-08-10",
        newCheckOutDate: "2026-08-12",
      }),
    ).not.toThrow();
  });

  it("rejects a second approved reschedule", () => {
    expect(() =>
      assertRescheduleAllowed({
        approvedRescheduleCount: 1,
        todayInBangkok: "2026-08-05",
        currentCheckInDate: "2026-08-10",
        newCheckInDate: "2026-08-12",
        newCheckOutDate: "2026-08-13",
      }),
    ).toThrow("RESCHEDULE_LIMIT_REACHED");
  });

  it("rejects less than three days of notice", () => {
    expect(() =>
      assertRescheduleAllowed({
        approvedRescheduleCount: 0,
        todayInBangkok: "2026-08-05",
        currentCheckInDate: "2026-08-07",
        newCheckInDate: "2026-08-10",
        newCheckOutDate: "2026-08-11",
      }),
    ).toThrow("RESCHEDULE_NOTICE_TOO_SHORT");
  });
});
