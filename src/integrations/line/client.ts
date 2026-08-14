import "server-only";

interface LinePayload {
  readonly lineUserId?: unknown;
  readonly bookingCode?: unknown;
  readonly amountSatang?: unknown;
  readonly deadlineAt?: unknown;
  readonly reason?: unknown;
  readonly newCheckInDate?: unknown;
  readonly newCheckOutDate?: unknown;
}

export async function sendLineOutboxEvent(input: {
  readonly eventId: string;
  readonly eventType: string;
  readonly payload: LinePayload;
}): Promise<void> {
  if (!input.eventType.startsWith("LINE_")) return;
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) throw new Error("LINE_CONFIG_MISSING");
  if (typeof input.payload.lineUserId !== "string") {
    throw new Error("LINE_RECIPIENT_MISSING");
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "x-line-retry-key": input.eventId,
    },
    body: JSON.stringify({
      to: input.payload.lineUserId,
      messages: [
        {
          type: "text",
          text: buildLineMessage(input.eventType, input.payload),
        },
      ],
    }),
  });
  // LINE returns 409 when the same retry key was already accepted. Treat it as
  // delivered so a worker retry cannot duplicate the message.
  if (!response.ok && response.status !== 409) {
    throw new Error(`LINE_HTTP_${response.status}`);
  }
}

function buildLineMessage(eventType: string, payload: LinePayload): string {
  const code =
    typeof payload.bookingCode === "string" ? payload.bookingCode : "";
  switch (eventType) {
    case "LINE_DEPOSIT_REQUIRED": {
      const amount =
        typeof payload.amountSatang === "number"
          ? (payload.amountSatang / 100).toLocaleString("th-TH")
          : "500";
      const deadline =
        typeof payload.deadlineAt === "string"
          ? new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
              dateStyle: "short",
              timeStyle: "short",
              timeZone: "Asia/Bangkok",
            }).format(new Date(payload.deadlineAt))
          : "ภายใน 1 ชั่วโมง";
      return `คำขอ ${code} ได้รับอนุมัติ กรุณาชำระมัดจำ ${amount} บาทภายใน ${deadline}`;
    }
    case "LINE_BOOKING_CONFIRMED":
      return `ยืนยันการจอง ${code} และตรวจรับมัดจำเรียบร้อยแล้ว`;
    case "LINE_DEPOSIT_EXPIRED":
      return `คำขอ ${code} หมดเวลาชำระมัดจำและถูกยกเลิกแล้ว`;
    case "LINE_BOOKING_REJECTED":
      return `คำขอ ${code} ไม่ได้รับการอนุมัติ${typeof payload.reason === "string" ? `: ${payload.reason}` : ""}`;
    case "LINE_RESCHEDULE_APPROVED":
      return `คำขอเลื่อนวันของ ${code} ได้รับอนุมัติ เป็น ${String(payload.newCheckInDate)} ถึง ${String(payload.newCheckOutDate)}`;
    case "LINE_RESCHEDULE_REJECTED":
      return `คำขอเลื่อนวันของ ${code} ไม่ได้รับการอนุมัติ${typeof payload.reason === "string" ? `: ${payload.reason}` : ""}`;
    default:
      throw new Error("LINE_EVENT_UNSUPPORTED");
  }
}
