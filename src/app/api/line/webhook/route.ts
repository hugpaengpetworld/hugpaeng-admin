import { NextResponse } from "next/server";

import { verifyLineSignature } from "@/integrations/line/signature";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1_000_000) {
    return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 1_000_000) {
    return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (
    !channelSecret ||
    !verifyLineSignature({
      rawBody,
      signature: request.headers.get("x-line-signature"),
      channelSecret,
    })
  ) {
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  // Phase 4 uses outbound notifications. Inbound events are acknowledged only
  // after verification; later features may enqueue narrowly scoped handlers.
  return NextResponse.json({ ok: true });
}
