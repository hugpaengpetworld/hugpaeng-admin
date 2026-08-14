export const PROMPTPAY_TARGET_TYPES = [
  "MOBILE",
  "NATIONAL_ID",
  "EWALLET",
] as const;

export type PromptPayTargetType = (typeof PROMPTPAY_TARGET_TYPES)[number];

const PROMPTPAY_CREDIT_TRANSFER_AID = "A000000677010111";

export function buildPromptPayPayload(input: {
  readonly targetType: PromptPayTargetType;
  readonly targetValue: string;
  readonly amountSatang: number;
  readonly merchantName?: string;
}): string {
  if (!Number.isSafeInteger(input.amountSatang) || input.amountSatang <= 0) {
    throw new RangeError("PROMPTPAY_AMOUNT_INVALID");
  }

  const target = normalizePromptPayTarget(input.targetType, input.targetValue);
  const accountInformation =
    field("00", PROMPTPAY_CREDIT_TRANSFER_AID) +
    field(target.subTag, target.value);
  const amount = `${Math.floor(input.amountSatang / 100)}.${String(
    input.amountSatang % 100,
  ).padStart(2, "0")}`;
  const merchantName = normalizeMerchantName(input.merchantName);
  const payloadWithoutCrc =
    field("00", "01") +
    field("01", "12") +
    field("29", accountInformation) +
    field("53", "764") +
    field("54", amount) +
    field("58", "TH") +
    field("59", merchantName) +
    field("60", "BANGKOK") +
    "6304";

  return payloadWithoutCrc + crc16Ccitt(payloadWithoutCrc);
}

export function normalizePromptPayTarget(
  type: PromptPayTargetType,
  rawValue: string,
): { readonly subTag: "01" | "02" | "03"; readonly value: string } {
  const value = rawValue.replace(/\D/g, "");
  if (type === "MOBILE") {
    if (!/^0\d{9}$/.test(value)) {
      throw new RangeError("PROMPTPAY_MOBILE_INVALID");
    }
    return { subTag: "01", value: `0066${value.slice(1)}` };
  }
  if (type === "NATIONAL_ID") {
    if (!/^\d{13}$/.test(value)) {
      throw new RangeError("PROMPTPAY_NATIONAL_ID_INVALID");
    }
    return { subTag: "02", value };
  }
  if (type === "EWALLET") {
    if (!/^\d{15}$/.test(value)) {
      throw new RangeError("PROMPTPAY_EWALLET_INVALID");
    }
    return { subTag: "03", value };
  }
  throw new RangeError("PROMPTPAY_TARGET_TYPE_INVALID");
}

export function maskPromptPayTarget(
  type: PromptPayTargetType,
  rawValue: string,
): string {
  const value = rawValue.replace(/\D/g, "");
  if (type === "MOBILE" && value.length === 10) {
    return `${value.slice(0, 3)}-xxx-${value.slice(-4)}`;
  }
  if (type === "NATIONAL_ID" && value.length === 13) {
    return `x-xxxx-xxxxx-${value.slice(-2)}-x`;
  }
  if (type === "EWALLET" && value.length === 15) {
    return `xxxxxxxxxxx${value.slice(-4)}`;
  }
  return "ไม่สามารถแสดงเลขหมายได้";
}

function field(id: string, value: string): string {
  const length = new TextEncoder().encode(value).length;
  if (length > 99) throw new RangeError("PROMPTPAY_FIELD_TOO_LONG");
  return `${id}${String(length).padStart(2, "0")}${value}`;
}

function normalizeMerchantName(value?: string): string {
  const normalized = (value ?? "BMP BOOKING")
    .normalize("NFKD")
    .toUpperCase()
    .replace(/[^A-Z0-9 .-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 25);
  return normalized || "BMP BOOKING";
}

function crc16Ccitt(value: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(value)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
