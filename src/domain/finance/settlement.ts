export const CHARGE_CATEGORIES = [
  "FOOD",
  "MEDICINE",
  "IV_FLUIDS",
  "BLOOD_TEST",
  "FLEA_TICK_PREVENTION",
  "CAT_COMBINATION_VACCINE",
  "CAT_FELV_VACCINE",
  "DOG_COMBINATION_VACCINE",
  "DOG_SIX_DISEASE_VACCINE",
  "RABIES_VACCINE",
  "MEDICAL_SERVICE",
  "OTHER",
] as const;

export type ChargeCategory = (typeof CHARGE_CATEGORIES)[number];

export const CHARGE_CATEGORY_LABELS: Readonly<Record<ChargeCategory, string>> =
  {
    FOOD: "ค่าอาหาร",
    MEDICINE: "ค่ายา",
    IV_FLUIDS: "ให้น้ำเกลือ",
    BLOOD_TEST: "ตรวจเลือด",
    FLEA_TICK_PREVENTION: "กำจัด/ป้องกันเห็บหมัด",
    CAT_COMBINATION_VACCINE: "วัคซีนรวมแมว",
    CAT_FELV_VACCINE: "วัคซีนป้องกันโรคลิวคีเมียแมว (FeLV)",
    DOG_COMBINATION_VACCINE: "วัคซีนรวมสุนัข",
    DOG_SIX_DISEASE_VACCINE: "วัคซีนรวม 6 โรคสุนัข",
    RABIES_VACCINE: "วัคซีนป้องกันโรคพิษสุนัขบ้า",
    MEDICAL_SERVICE: "ค่าบริการทางสัตวแพทย์",
    OTHER: "อื่น ๆ",
  };

export interface ChargeInput {
  readonly category: ChargeCategory;
  readonly amountSatang: number;
  readonly detail?: string;
}

export interface Settlement {
  readonly lodgingTotalSatang: number;
  readonly extraChargesSatang: number;
  readonly totalSatang: number;
  readonly depositSatang: number;
  readonly amountDueSatang: number;
  readonly refundDueSatang: number;
}

export function calculateSettlement(input: {
  readonly lodgingTotalSatang: number;
  readonly depositSatang: number;
  readonly charges: readonly ChargeInput[];
}): Settlement {
  assertSatang(input.lodgingTotalSatang, true);
  assertSatang(input.depositSatang, true);

  let extraChargesSatang = 0;
  for (const charge of input.charges) {
    assertCharge(charge);
    extraChargesSatang += charge.amountSatang;
    if (!Number.isSafeInteger(extraChargesSatang)) {
      throw new RangeError("ยอดค่าใช้จ่ายรวมสูงเกินขอบเขตที่รองรับ");
    }
  }

  const totalSatang = input.lodgingTotalSatang + extraChargesSatang;
  if (!Number.isSafeInteger(totalSatang)) {
    throw new RangeError("ยอดรวมสูงเกินขอบเขตที่รองรับ");
  }

  return {
    lodgingTotalSatang: input.lodgingTotalSatang,
    extraChargesSatang,
    totalSatang,
    depositSatang: input.depositSatang,
    amountDueSatang: Math.max(totalSatang - input.depositSatang, 0),
    refundDueSatang: Math.max(input.depositSatang - totalSatang, 0),
  };
}

export function assertCheckInDeposit(
  depositSatang: number,
  verifiedDepositSatang: number,
): void {
  assertSatang(depositSatang, true);
  assertSatang(verifiedDepositSatang, true);
  if (depositSatang < verifiedDepositSatang) {
    throw new RangeError("ยอดมัดจำรวมต้องไม่น้อยกว่ายอดที่ตรวจรับแล้ว");
  }
}

export function assertCharge(charge: ChargeInput): void {
  if (!isChargeCategory(charge.category)) {
    throw new RangeError("ประเภทค่าใช้จ่ายไม่ถูกต้อง");
  }
  assertSatang(charge.amountSatang, false);
  const detail = charge.detail?.trim() ?? "";
  if (detail.length > 150)
    throw new RangeError("รายละเอียดต้องไม่เกิน 150 ตัวอักษร");
  if (charge.category === "OTHER" && !detail) {
    throw new RangeError("ค่าใช้จ่ายอื่น ๆ ต้องระบุรายละเอียด");
  }
}

export function isChargeCategory(value: string): value is ChargeCategory {
  return (CHARGE_CATEGORIES as readonly string[]).includes(value);
}

export function parseBahtToSatang(value: string): number {
  const normalized = value.trim().replaceAll(",", "");
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(normalized)) {
    throw new RangeError("จำนวนเงินไม่ถูกต้อง");
  }
  const [baht, fraction = ""] = normalized.split(".");
  const satang = Number(baht) * 100 + Number(fraction.padEnd(2, "0"));
  assertSatang(satang, true);
  return satang;
}

function assertSatang(value: number, allowZero: boolean): void {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    (!allowZero && value === 0)
  ) {
    throw new RangeError("จำนวนเงินไม่ถูกต้อง");
  }
}
