import { describe, expect, it } from "vitest";

import { deriveRoomDisplayStatus } from "./status";

describe("room display status priority", () => {
  it("keeps an open physical stay occupied regardless of planned dates or room state", () => {
    expect(
      deriveRoomDisplayStatus({
        hasOpenStay: true,
        operationalStatus: "AVAILABLE",
        allocationStatus: null,
      }),
    ).toBe("OCCUPIED");
    expect(
      deriveRoomDisplayStatus({
        hasOpenStay: true,
        operationalStatus: "CLEANING",
        allocationStatus: "RESERVED",
      }),
    ).toBe("OCCUPIED");
  });

  it("shows blocking operational states before planned allocations", () => {
    expect(
      deriveRoomDisplayStatus({
        hasOpenStay: false,
        operationalStatus: "MAINTENANCE",
        allocationStatus: "RESERVED",
      }),
    ).toBe("MAINTENANCE");
  });

  it("maps holds and reservations only when the room is operationally available", () => {
    expect(
      deriveRoomDisplayStatus({
        hasOpenStay: false,
        operationalStatus: "AVAILABLE",
        allocationStatus: "HOLD",
      }),
    ).toBe("PENDING");
    expect(
      deriveRoomDisplayStatus({
        hasOpenStay: false,
        operationalStatus: "AVAILABLE",
        allocationStatus: "RESERVED",
      }),
    ).toBe("CONFIRMED");
  });
});
