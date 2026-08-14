import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyLineSignature(input: {
  readonly rawBody: string;
  readonly signature: string | null;
  readonly channelSecret: string;
}): boolean {
  if (!input.signature || !input.channelSecret) return false;
  const expected = createHmac("sha256", input.channelSecret)
    .update(input.rawBody)
    .digest();
  let received: Buffer;
  try {
    received = Buffer.from(input.signature, "base64");
  } catch {
    return false;
  }
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}
