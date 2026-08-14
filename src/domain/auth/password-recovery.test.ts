import { describe, expect, it } from "vitest";

import { classifyPasswordRecoveryFailure } from "./password-recovery";

describe("classifyPasswordRecoveryFailure", () => {
  it("classifies the Supabase email quota error as rate limited", () => {
    expect(
      classifyPasswordRecoveryFailure({
        code: "over_email_send_rate_limit",
        status: 429,
      }),
    ).toBe("rate_limited");
  });

  it("treats any HTTP 429 as rate limited", () => {
    expect(classifyPasswordRecoveryFailure({ status: 429 })).toBe(
      "rate_limited",
    );
  });

  it("does not expose other provider failures", () => {
    expect(
      classifyPasswordRecoveryFailure({
        code: "unexpected_failure",
        status: 500,
      }),
    ).toBe("send_failed");
  });
});
