import "server-only";

import { createHash, createHmac, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

const safeErrors: Readonly<
  Record<string, { status: number; message: string }>
> = {
  VALIDATION_ERROR: { status: 400, message: "ข้อมูลที่ส่งมาไม่ถูกต้อง" },
  INVALID_DATE_RANGE: { status: 400, message: "ช่วงวันที่เข้าพักไม่ถูกต้อง" },
  INVALID_DOG_WEIGHT: {
    status: 400,
    message: "น้ำหนักสุนัขไม่ผ่านเงื่อนไขของห้องพัก",
  },
  INVALID_VACCINATION_EVIDENCE: {
    status: 400,
    message: "ไฟล์หลักฐานวัคซีนไม่ถูกต้อง",
  },
  CAPACITY_EXCEEDED: { status: 400, message: "จำนวนสัตว์เกินความจุของห้องพัก" },
  ROOM_UNAVAILABLE: { status: 409, message: "ห้องถูกจองไปแล้ว กรุณาค้นหาใหม่" },
  IDEMPOTENCY_CONFLICT: {
    status: 409,
    message: "คำขอซ้ำมีข้อมูลไม่ตรงกับคำขอเดิม",
  },
  RATE_LIMITED: { status: 429, message: "ส่งคำขอบ่อยเกินไป กรุณารอสักครู่" },
  PAYMENT_DEADLINE_EXPIRED: {
    status: 409,
    message: "รายการนี้หมดเวลาส่งหลักฐานมัดจำแล้ว",
  },
  RESCHEDULE_LIMIT_REACHED: {
    status: 409,
    message: "รายการนี้ใช้สิทธิ์เลื่อนวันแล้ว",
  },
  RESCHEDULE_NOTICE_TOO_SHORT: {
    status: 409,
    message: "ต้องขอเลื่อนล่วงหน้าอย่างน้อย 3 วัน",
  },
  INVALID_STATUS_TRANSITION: {
    status: 409,
    message: "สถานะปัจจุบันไม่อนุญาตให้ดำเนินการนี้",
  },
  NOT_FOUND: { status: 404, message: "ไม่พบข้อมูลที่ต้องการ" },
};

export function assertPublicPostRequest(
  request: Request,
  maximumBodyBytes = 65_536,
): void {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maximumBodyBytes)
    throw new PublicApiError("VALIDATION_ERROR");

  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL;
  const origin = request.headers.get("origin");
  if (
    configuredOrigin &&
    origin &&
    new URL(origin).origin !== new URL(configuredOrigin).origin
  ) {
    throw new PublicApiError("FORBIDDEN");
  }
}

export function createPublicFingerprint(request: Request): string {
  const secret = process.env.RATE_LIMIT_HASH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("RATE_LIMIT_CONFIG_MISSING");
  const address =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const agent = request.headers.get("user-agent")?.slice(0, 300) ?? "unknown";
  return createHmac("sha256", secret)
    .update(`${address}\n${agent}`)
    .digest("hex");
}

export function hashRequest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function publicApiErrorResponse(
  error: unknown,
  requestId = randomUUID(),
): NextResponse {
  const rawMessage =
    error instanceof PublicApiError
      ? error.code
      : error instanceof Error
        ? error.message
        : "UNKNOWN";
  const code = Object.keys(safeErrors).find((item) =>
    rawMessage.includes(item),
  );
  const safe = code ? safeErrors[code] : undefined;
  return NextResponse.json(
    {
      ok: false,
      error: code ?? "INTEGRATION_TEMPORARILY_UNAVAILABLE",
      message: safe?.message ?? "ระบบยังไม่พร้อมให้บริการ กรุณาลองใหม่ภายหลัง",
      requestId,
    },
    { status: safe?.status ?? 503 },
  );
}

export class PublicApiError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "PublicApiError";
  }
}
