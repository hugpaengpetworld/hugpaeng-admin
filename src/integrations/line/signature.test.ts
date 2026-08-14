import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyLineSignature } from "./signature";

describe("LINE webhook signature", () => {
  it("accepts the exact raw request body", () => {
    const secret = "test-channel-secret";
    const rawBody = '{"destination":"U123","events":[]}';
    const signature = createHmac("sha256", secret)
      .update(rawBody)
      .digest("base64");
    expect(
      verifyLineSignature({ rawBody, signature, channelSecret: secret }),
    ).toBe(true);
    expect(
      verifyLineSignature({
        rawBody: `${rawBody}\n`,
        signature,
        channelSecret: secret,
      }),
    ).toBe(false);
  });

  it("rejects missing or malformed signatures", () => {
    expect(
      verifyLineSignature({
        rawBody: "{}",
        signature: null,
        channelSecret: "secret",
      }),
    ).toBe(false);
  });
});
