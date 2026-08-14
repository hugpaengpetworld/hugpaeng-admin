export type PasswordRecoveryError = {
  readonly code?: string;
  readonly status?: number;
};

export type PasswordRecoveryFailure = "rate_limited" | "send_failed";

export function classifyPasswordRecoveryFailure(
  error: PasswordRecoveryError,
): PasswordRecoveryFailure {
  if (error.status === 429 || error.code === "over_email_send_rate_limit") {
    return "rate_limited";
  }

  return "send_failed";
}
