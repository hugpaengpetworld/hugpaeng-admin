const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function formatDisplayDate(isoDate: string): string {
  if (!isIsoDate(isoDate)) throw new RangeError("วันที่ไม่ถูกต้อง");
  const [year, month, day] = isoDate.split("-");
  return `${day}-${month}-${year}`;
}

export function addDays(isoDate: string, amount: number): string {
  if (!isIsoDate(isoDate) || !Number.isInteger(amount))
    throw new RangeError("วันที่ไม่ถูกต้อง");
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function todayInBangkok(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}
