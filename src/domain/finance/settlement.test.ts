import { describe, expect, it } from "vitest";

import {
  CHARGE_CATEGORIES,
  CHARGE_CATEGORY_LABELS,
  assertCheckInDeposit,
  calculateSettlement,
  isChargeCategory,
  parseBahtToSatang,
} from "./settlement";

describe("checkout settlement", () => {
  it("calculates lodging, extras, deposit, and exact amount due in satang", () => {
    expect(
      calculateSettlement({
        lodgingTotalSatang: 45_000,
        depositSatang: 20_000,
        charges: [
          { category: "FOOD", amountSatang: 3_500 },
          { category: "MEDICINE", amountSatang: 1_500 },
        ],
      }),
    ).toEqual({
      lodgingTotalSatang: 45_000,
      extraChargesSatang: 5_000,
      totalSatang: 50_000,
      depositSatang: 20_000,
      amountDueSatang: 30_000,
      refundDueSatang: 0,
    });
  });

  it("calculates a refund without producing a negative amount due", () => {
    expect(
      calculateSettlement({
        lodgingTotalSatang: 15_000,
        depositSatang: 20_000,
        charges: [],
      }),
    ).toMatchObject({ amountDueSatang: 0, refundDueSatang: 5_000 });
  });

  it("requires a description for other charges", () => {
    expect(() =>
      calculateSettlement({
        lodgingTotalSatang: 15_000,
        depositSatang: 0,
        charges: [{ category: "OTHER", amountSatang: 100 }],
      }),
    ).toThrow("ต้องระบุรายละเอียด");
  });

  it("rejects floating-point and non-positive charge amounts", () => {
    for (const amountSatang of [0, -1, 100.5]) {
      expect(() =>
        calculateSettlement({
          lodgingTotalSatang: 15_000,
          depositSatang: 0,
          charges: [{ category: "FOOD", amountSatang }],
        }),
      ).toThrow("จำนวนเงินไม่ถูกต้อง");
    }
  });

  it("exposes every approved checkout charge category with a Thai label", () => {
    expect(CHARGE_CATEGORIES).toHaveLength(12);
    for (const category of CHARGE_CATEGORIES) {
      expect(isChargeCategory(category)).toBe(true);
      expect(CHARGE_CATEGORY_LABELS[category].trim()).not.toBe("");
    }
    expect(isChargeCategory("UNAPPROVED_CHARGE")).toBe(false);
    expect(CHARGE_CATEGORY_LABELS.MEDICAL_SERVICE).toBe(
      "ค่าบริการทางสัตวแพทย์",
    );
  });
});

describe("baht input", () => {
  it("converts decimal text without floating-point money", () => {
    expect(parseBahtToSatang("1,234.50")).toBe(123_450);
    expect(parseBahtToSatang("150")).toBe(15_000);
  });

  it("rejects more than two decimal places", () => {
    expect(() => parseBahtToSatang("1.001")).toThrow("จำนวนเงินไม่ถูกต้อง");
  });
});

describe("check-in deposit", () => {
  it("accepts the verified amount or a larger actual total", () => {
    expect(() => assertCheckInDeposit(50_000, 50_000)).not.toThrow();
    expect(() => assertCheckInDeposit(70_000, 50_000)).not.toThrow();
  });

  it("rejects an actual total below the already verified amount", () => {
    expect(() => assertCheckInDeposit(49_999, 50_000)).toThrow(
      "ต้องไม่น้อยกว่า",
    );
  });
});
