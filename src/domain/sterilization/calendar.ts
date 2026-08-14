import { isIsoDate } from "@/domain/shared/date";

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

const THAI_MONTH_NAMES = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
] as const;

export const THAI_WEEKDAY_LABELS = [
  "อา",
  "จ",
  "อ",
  "พ",
  "พฤ",
  "ศ",
  "ส",
] as const;

export function buildSterilizationMonthGrid(
  month: string,
): readonly (string | null)[] {
  const { year, monthIndex } = parseMonth(month);
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const totalDays = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from(
    { length: firstWeekday },
    () => null,
  );
  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(`${month}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function shiftCalendarMonth(month: string, amount: number): string {
  const { year, monthIndex } = parseMonth(month);
  if (!Number.isInteger(amount)) throw new RangeError("INVALID_MONTH_OFFSET");
  const shifted = new Date(Date.UTC(year, monthIndex + amount, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatThaiCalendarMonth(month: string): string {
  const { year, monthIndex } = parseMonth(month);
  return `${THAI_MONTH_NAMES[monthIndex]} ${year}`;
}

export function calendarDayNumber(date: string): number {
  if (!isIsoDate(date)) throw new RangeError("INVALID_CALENDAR_DATE");
  return Number(date.slice(8, 10));
}

function parseMonth(month: string): {
  readonly year: number;
  readonly monthIndex: number;
} {
  if (!MONTH_PATTERN.test(month))
    throw new RangeError("INVALID_CALENDAR_MONTH");
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  if (year < 1 || monthIndex < 0 || monthIndex > 11) {
    throw new RangeError("INVALID_CALENDAR_MONTH");
  }
  return { year, monthIndex };
}
