import { describe, expect, it } from "vitest";

import { getCheckoutTiming } from "./operations";

describe("checkout timing in Bangkok", () => {
  const bangkokLateEvening = new Date("2026-08-05T17:30:00.000Z");

  it("uses the Bangkok calendar date at the UTC boundary", () => {
    expect(getCheckoutTiming("2026-08-06", bangkokLateEvening)).toBe(
      "DUE_TODAY",
    );
    expect(getCheckoutTiming("2026-08-07", bangkokLateEvening)).toBe("EARLY");
    expect(getCheckoutTiming("2026-08-05", bangkokLateEvening)).toBe("OVERDUE");
  });
});
