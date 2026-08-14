import { describe, expect, it } from "vitest";

import { parseCheckoutChargeRows } from "./parse-charge-rows";

describe("checkout charge rows", () => {
  it("parses multiple rows into integer satang and skips one blank row", () => {
    expect(
      parseCheckoutChargeRows([
        { category: "FOOD", amount: "125.50", detail: "" },
        {
          category: "CAT_FELV_VACCINE",
          amount: "350",
          detail: "",
        },
        { category: "", amount: "", detail: "" },
      ]),
    ).toEqual([
      { category: "FOOD", amountSatang: 12_550, detail: undefined },
      {
        category: "CAT_FELV_VACCINE",
        amountSatang: 35_000,
        detail: "วัคซีนป้องกันโรคลิวคีเมียแมว (FeLV)",
      },
    ]);
  });

  it("keeps the staff-entered description for other", () => {
    expect(
      parseCheckoutChargeRows([
        { category: "OTHER", amount: "80", detail: "ค่าผ้ารองกรง" },
      ]),
    ).toEqual([
      {
        category: "OTHER",
        amountSatang: 8_000,
        detail: "ค่าผ้ารองกรง",
      },
    ]);
  });

  it("rejects unknown, incomplete, malformed, and undescribed other rows", () => {
    for (const row of [
      { category: "UNKNOWN", amount: "100", detail: "" },
      { category: "FOOD", amount: "", detail: "" },
      { category: "", amount: "100", detail: "" },
      { category: "MEDICINE", amount: "10.999", detail: "" },
      { category: "OTHER", amount: "100", detail: "" },
    ]) {
      expect(() => parseCheckoutChargeRows([row])).toThrow();
    }
  });
});
