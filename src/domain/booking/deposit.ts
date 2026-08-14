export const LINE_DEPOSIT_SATANG = 50_000;
export const LINE_DEPOSIT_WINDOW_MINUTES = 60;

export function requiredLineDepositSatang(roomUnits: number): number {
  if (!Number.isInteger(roomUnits) || roomUnits < 1) {
    throw new RangeError("INVALID_ROOM_UNIT_COUNT");
  }
  return LINE_DEPOSIT_SATANG;
}

export function createDepositDeadline(approvedAt: Date): Date {
  if (Number.isNaN(approvedAt.valueOf())) throw new RangeError("INVALID_DATE");
  return new Date(
    approvedAt.getTime() + LINE_DEPOSIT_WINDOW_MINUTES * 60 * 1_000,
  );
}

export function isDepositDeadlineExpired(deadline: Date, now: Date): boolean {
  if (Number.isNaN(deadline.valueOf()) || Number.isNaN(now.valueOf())) {
    throw new RangeError("INVALID_DATE");
  }
  return now.getTime() >= deadline.getTime();
}
