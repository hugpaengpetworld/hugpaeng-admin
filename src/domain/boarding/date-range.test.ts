import { describe, expect, it } from "vitest";

import { dateRangesOverlap } from "./date-range";

describe("planned stay ranges", () => {
  it("does not overlap when checkout touches the next check-in", () => {
    expect(
      dateRangesOverlap(
        { startDate: "2026-08-01", endDate: "2026-08-03" },
        { startDate: "2026-08-03", endDate: "2026-08-05" },
      ),
    ).toBe(false);
  });

  it("detects intersecting ranges", () => {
    expect(
      dateRangesOverlap(
        { startDate: "2026-08-01", endDate: "2026-08-04" },
        { startDate: "2026-08-03", endDate: "2026-08-05" },
      ),
    ).toBe(true);
  });
});
