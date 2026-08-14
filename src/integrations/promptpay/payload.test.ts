import { describe, expect, it } from "vitest";

import {
  buildPromptPayPayload,
  maskPromptPayTarget,
  normalizePromptPayTarget,
} from "@/integrations/promptpay/payload";

describe("PromptPay payload", () => {
  it("normalizes a Thai mobile number for PromptPay Tag 29", () => {
    expect(normalizePromptPayTarget("MOBILE", "081-234-5678")).toEqual({
      subTag: "01",
      value: "0066812345678",
    });
  });

  it("builds a dynamic payload with the exact two-decimal amount and valid CRC", () => {
    const payload = buildPromptPayPayload({
      targetType: "MOBILE",
      targetValue: "0812345678",
      amountSatang: 70_025,
      merchantName: "BMP Booking",
    });

    expect(payload).toContain("010212");
    expect(payload).toContain("5406700.25");
    expect(payload).toContain("0066812345678");
    expect(payload).toMatch(/6304[0-9A-F]{4}$/);
    expect(payload).toBe(
      "00020101021229370016A0000006770101110113006681234567853037645406700.255802TH5911BMP BOOKING6007BANGKOK6304BBBE",
    );
  });

  it("rejects zero amounts and malformed targets", () => {
    expect(() =>
      buildPromptPayPayload({
        targetType: "MOBILE",
        targetValue: "0812345678",
        amountSatang: 0,
      }),
    ).toThrow("PROMPTPAY_AMOUNT_INVALID");
    expect(() => normalizePromptPayTarget("MOBILE", "08123")).toThrow(
      "PROMPTPAY_MOBILE_INVALID",
    );
  });

  it("masks configured targets before displaying them", () => {
    expect(maskPromptPayTarget("MOBILE", "0812345678")).toBe("081-xxx-5678");
    expect(maskPromptPayTarget("NATIONAL_ID", "1234567890123")).toBe(
      "x-xxxx-xxxxx-23-x",
    );
  });
});
