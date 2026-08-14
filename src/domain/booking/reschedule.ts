import { assertIsoDateRange } from "@/domain/boarding/date-range";

export const MINIMUM_RESCHEDULE_NOTICE_DAYS = 3;

export class RescheduleRuleError extends Error {
  constructor(
    readonly code: "RESCHEDULE_LIMIT_REACHED" | "RESCHEDULE_NOTICE_TOO_SHORT",
  ) {
    super(code);
    this.name = "RescheduleRuleError";
  }
}

export function assertRescheduleAllowed(input: {
  readonly approvedRescheduleCount: number;
  readonly todayInBangkok: string;
  readonly currentCheckInDate: string;
  readonly newCheckInDate: string;
  readonly newCheckOutDate: string;
}): void {
  assertIsoDateRange({
    startDate: input.newCheckInDate,
    endDate: input.newCheckOutDate,
  });
  if (input.approvedRescheduleCount >= 1) {
    throw new RescheduleRuleError("RESCHEDULE_LIMIT_REACHED");
  }
  if (
    daysBetween(input.todayInBangkok, input.currentCheckInDate) <
      MINIMUM_RESCHEDULE_NOTICE_DAYS ||
    daysBetween(input.todayInBangkok, input.newCheckInDate) <
      MINIMUM_RESCHEDULE_NOTICE_DAYS
  ) {
    throw new RescheduleRuleError("RESCHEDULE_NOTICE_TOO_SHORT");
  }
}

function daysBetween(start: string, end: string): number {
  const startTime = Date.parse(`${start}T00:00:00.000Z`);
  const endTime = Date.parse(`${end}T00:00:00.000Z`);
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
    throw new RangeError("INVALID_DATE");
  }
  return Math.floor((endTime - startTime) / 86_400_000);
}
