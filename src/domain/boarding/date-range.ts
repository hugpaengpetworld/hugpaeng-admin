export interface DateRange {
  readonly startDate: string;
  readonly endDate: string;
}

export function dateRangesOverlap(left: DateRange, right: DateRange): boolean {
  assertIsoDateRange(left);
  assertIsoDateRange(right);
  return left.startDate < right.endDate && right.startDate < left.endDate;
}

export function assertIsoDateRange(range: DateRange): void {
  if (!isIsoDate(range.startDate) || !isIsoDate(range.endDate)) {
    throw new RangeError("วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD");
  }
  if (range.startDate >= range.endDate) {
    throw new RangeError("วันออกต้องอยู่หลังวันเข้า");
  }
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}
