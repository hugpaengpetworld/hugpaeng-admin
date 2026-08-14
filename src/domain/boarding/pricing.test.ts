import { describe, expect, it } from "vitest";

import { calculateDayCarePrice, calculateOvernightPrice } from "./pricing";

describe("boarding prices in satang", () => {
  it("charges 150 THB per night for one animal", () => {
    expect(
      calculateOvernightPrice({ species: "CAT", animals: [{}], nights: 2 }),
    ).toBe(30_000);
    expect(
      calculateOvernightPrice({
        species: "DOG",
        animals: [{ weightKg: 10 }],
        nights: 1,
      }),
    ).toBe(15_000);
  });

  it("charges 200 THB per night for two compatible animals", () => {
    expect(
      calculateOvernightPrice({ species: "CAT", animals: [{}, {}], nights: 3 }),
    ).toBe(60_000);
  });

  it("rejects zero or fractional nights", () => {
    expect(() =>
      calculateOvernightPrice({ species: "CAT", animals: [{}], nights: 0 }),
    ).toThrow();
    expect(() =>
      calculateOvernightPrice({ species: "CAT", animals: [{}], nights: 1.5 }),
    ).toThrow();
  });
});

describe("day-care pricing", () => {
  it("rounds 30 minutes down and more than 30 minutes up", () => {
    expect(calculateDayCarePrice(90)).toBe(5_000);
    expect(calculateDayCarePrice(91)).toBe(10_000);
  });

  it("caps charges at 150 THB after three billable hours", () => {
    expect(calculateDayCarePrice(180)).toBe(15_000);
    expect(calculateDayCarePrice(9 * 60)).toBe(15_000);
  });
});
