import { describe, expect, it } from "vitest";

import {
  buildSterilizationMonthGrid,
  calendarDayNumber,
  formatThaiCalendarMonth,
  shiftCalendarMonth,
} from "./calendar";

describe("sterilization calendar", () => {
  it("aligns a Gregorian month to Sunday-first calendar weeks", () => {
    const cells = buildSterilizationMonthGrid("2026-08");
    expect(cells).toHaveLength(42);
    expect(cells.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(cells[6]).toBe("2026-08-01");
    expect(cells[36]).toBe("2026-08-31");
  });

  it("moves across year boundaries", () => {
    expect(shiftCalendarMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftCalendarMonth("2026-12", 1)).toBe("2027-01");
  });

  it("uses Thai month names with Gregorian years", () => {
    expect(formatThaiCalendarMonth("2026-08")).toBe("สิงหาคม 2026");
    expect(calendarDayNumber("2026-08-09")).toBe(9);
  });
});
