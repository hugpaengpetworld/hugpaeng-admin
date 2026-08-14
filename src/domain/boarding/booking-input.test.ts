import { describe, expect, it } from "vitest";

import {
  backOfficeBookingSchema,
  normalizePhone,
  publicBookingRequestSchema,
} from "./booking-input";

describe("booking input validation", () => {
  it("accepts a two-cat public request with optional weights", () => {
    const result = publicBookingRequestSchema.safeParse({
      customerName: "เจ้าของแมว",
      customerPhone: "081-234-5678",
      checkInDate: "2026-09-01",
      checkOutDate: "2026-09-03",
      species: "CAT",
      pets: [
        { name: "ชาไทย", weightKg: "" },
        { name: "โกโก้", weightKg: null },
      ],
      idempotencyKey: "12345678-1234-1234-1234-123456789012",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a missing dog weight", () => {
    const result = publicBookingRequestSchema.safeParse({
      customerName: "เจ้าของสุนัข",
      customerPhone: "0812345678",
      checkInDate: "2026-09-01",
      checkOutDate: "2026-09-03",
      species: "DOG",
      pets: [{ name: "ด่าง", weightKg: "" }],
      idempotencyKey: "12345678-1234-1234-1234-123456789012",
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicated rooms in a multi-room request", () => {
    const roomId = "11111111-1111-4111-8111-111111111111";
    const result = backOfficeBookingSchema.safeParse({
      customerName: "ลูกค้า",
      customerPhone: "0812345678",
      checkInDate: "2026-09-01",
      checkOutDate: "2026-09-03",
      channel: "PHONE",
      depositSatang: 0,
      idempotencyKey: "12345678-1234-1234-1234-123456789012",
      units: [
        {
          roomId,
          species: "CAT",
          nightlyRateSatang: 12_000,
          pets: [{ name: "หนึ่ง", weightKg: null }],
        },
        {
          roomId,
          species: "CAT",
          nightlyRateSatang: 12_000,
          pets: [{ name: "สอง", weightKg: null }],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("accepts a custom per-room nightly rate in satang", () => {
    const result = backOfficeBookingSchema.safeParse({
      customerName: "ลูกค้าประจำ",
      customerPhone: "0812345678",
      checkInDate: "2026-09-01",
      checkOutDate: "2026-09-05",
      channel: "PHONE",
      depositSatang: 0,
      idempotencyKey: "12345678-1234-1234-1234-123456789012",
      units: [
        {
          roomId: "11111111-1111-4111-8111-111111111111",
          species: "CAT",
          nightlyRateSatang: 12_000,
          pets: [{ name: "ชาไทย", weightKg: null }],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects a zero nightly rate", () => {
    const result = backOfficeBookingSchema.safeParse({
      customerName: "ลูกค้า",
      customerPhone: "0812345678",
      checkInDate: "2026-09-01",
      checkOutDate: "2026-09-02",
      channel: "PHONE",
      depositSatang: 0,
      idempotencyKey: "12345678-1234-1234-1234-123456789012",
      units: [
        {
          roomId: "11111111-1111-4111-8111-111111111111",
          species: "CAT",
          nightlyRateSatang: 0,
          pets: [{ name: "ชาไทย", weightKg: null }],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("normalizes display punctuation out of phone numbers", () => {
    expect(normalizePhone("+66 (81) 234-5678")).toBe("+66812345678");
  });
});
