import { describe, expect, it } from "vitest";

import { addDays, formatDisplayDate, todayInBangkok } from "./date";

describe("clinic date boundaries", () => {
  it("formats Gregorian dates as DD-MM-YYYY", () => {
    expect(formatDisplayDate("2026-08-05")).toBe("05-08-2026");
  });

  it("uses Asia/Bangkok when UTC is still the prior day", () => {
    expect(todayInBangkok(new Date("2026-08-04T18:30:00.000Z"))).toBe(
      "2026-08-05",
    );
  });

  it("moves dates without browser locale parsing", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});
