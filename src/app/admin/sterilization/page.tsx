import Link from "next/link";

import { saveSterilizationHolidayAction } from "@/app/admin/sterilization/actions";
import { SterilizationCalendarGrid } from "@/components/sterilization/sterilization-calendar-grid";
import { Icon } from "@/components/ui/icon";
import { requireTenantContext } from "@/data/auth/tenant-context";
import {
  listSterilizationAppointments,
  listSterilizationHolidays,
} from "@/data/sterilization/appointments";
import { formatDisplayDate, todayInBangkok } from "@/domain/shared/date";
import { shiftCalendarMonth } from "@/domain/sterilization/calendar";
import {
  STERILIZATION_DAILY_CAPACITY,
  sterilizationErrorMessage,
} from "@/domain/sterilization/rules";

export default async function SterilizationCalendarPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    month?: string;
    success?: string;
    error?: string;
  }>;
}) {
  const [query, context] = await Promise.all([
    searchParams,
    requireTenantContext(),
  ]);
  const currentMonth = todayInBangkok().slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(query.month ?? "")
    ? query.month!
    : currentMonth;
  const [appointments, holidays] = await Promise.all([
    listSterilizationAppointments({ month }),
    listSterilizationHolidays(month),
  ]);
  const canManageHolidays =
    context.role === "OWNER" || context.role === "DOCTOR";
  const activeHolidays = holidays.filter((item) => item.isActive);

  return (
    <div className="mx-auto max-w-[96rem] space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#2d6a50]">ทำหมัน</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
            ปฏิทินคิวทำหมัน
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            รับนัดได้สูงสุด {STERILIZATION_DAILY_CAPACITY} ตัวต่อวัน
            และแสดงคิวตามเวลาประเทศไทย
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/sterilization/list"
            className="inline-flex min-h-11 items-center rounded-xl border border-[#123c2f] bg-white px-4 font-bold"
          >
            รายการนัดทั้งหมด
          </Link>
          <Link
            href="/admin/sterilization/new"
            className="inline-flex min-h-11 items-center rounded-xl bg-[#2d7a5d] px-5 font-bold text-white shadow-sm hover:bg-[#123c2f]"
          >
            + รับจองทำหมัน
          </Link>
        </div>
      </header>

      {query.success && (
        <div
          role="status"
          className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          บันทึกข้อมูลเรียบร้อยแล้ว
        </div>
      )}
      {query.error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          {sterilizationErrorMessage(query.error)}
        </div>
      )}

      <section className="rounded-3xl border border-emerald-900/10 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold">
              เลือกเดือน
              <input
                name="month"
                type="month"
                defaultValue={month}
                className="form-input mt-1.5"
              />
            </label>
            <button className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 font-bold hover:bg-slate-50">
              แสดงปฏิทิน
            </button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/sterilization?month=${shiftCalendarMonth(month, -1)}`}
              aria-label="เดือนก่อนหน้า"
              className="grid size-11 place-items-center rounded-xl border border-slate-300 bg-white hover:bg-slate-50"
            >
              <Icon name="chevron-left" className="size-5" />
            </Link>
            <Link
              href={`/admin/sterilization?month=${currentMonth}`}
              className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold hover:bg-slate-50"
            >
              เดือนนี้
            </Link>
            <Link
              href={`/admin/sterilization?month=${shiftCalendarMonth(month, 1)}`}
              aria-label="เดือนถัดไป"
              className="grid size-11 place-items-center rounded-xl border border-slate-300 bg-white hover:bg-slate-50"
            >
              <Icon name="chevron-right" className="size-5" />
            </Link>
            {canManageHolidays && (
              <a
                href="#holiday-settings"
                className="inline-flex min-h-11 items-center rounded-xl border border-[#2d7a5d] px-4 text-sm font-bold text-[#174d3b] hover:bg-emerald-50"
              >
                ตั้งวันหยุดทำหมัน
              </a>
            )}
          </div>
        </div>
      </section>

      <SterilizationCalendarGrid
        month={month}
        appointments={appointments}
        holidays={holidays}
        canOverrideHoliday={canManageHolidays}
      />

      {canManageHolidays && (
        <section
          id="holiday-settings"
          className="scroll-mt-6 rounded-3xl border border-emerald-900/10 bg-white p-5 shadow-sm"
        >
          <h2 className="text-lg font-bold">จัดการวันหยุดทำหมัน</h2>
          <form
            action={saveSterilizationHolidayAction}
            className="mt-4 grid gap-3 sm:grid-cols-[180px_1fr_auto]"
          >
            <input type="hidden" name="month" value={month} />
            <input type="hidden" name="isActive" value="true" />
            <label className="text-sm font-semibold">
              วันที่
              <input
                name="holidayDate"
                type="date"
                required
                min={`${month}-01`}
                max={`${month}-31`}
                className="form-input mt-1.5"
              />
            </label>
            <label className="text-sm font-semibold">
              เหตุผล
              <input
                name="reason"
                required
                maxLength={300}
                className="form-input mt-1.5"
                placeholder="เช่น วันหยุดคลินิก หรือหมอไม่อยู่"
              />
            </label>
            <button className="min-h-11 self-end rounded-xl bg-[#123c2f] px-4 font-bold text-white">
              บันทึกวันหยุด
            </button>
          </form>
          {activeHolidays.length > 0 && (
            <div className="mt-4 space-y-2">
              {activeHolidays.map((holiday) => (
                <form
                  key={holiday.id}
                  action={saveSterilizationHolidayAction}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-pink-200 bg-pink-50 p-3"
                >
                  <input type="hidden" name="month" value={month} />
                  <input
                    type="hidden"
                    name="holidayDate"
                    value={holiday.holidayDate}
                  />
                  <input type="hidden" name="reason" value={holiday.reason} />
                  <input type="hidden" name="isActive" value="false" />
                  <span className="flex-1 text-sm">
                    <strong>{formatDisplayDate(holiday.holidayDate)}</strong> ·{" "}
                    {holiday.reason}
                  </span>
                  <button className="min-h-11 rounded-xl border border-red-300 px-4 text-sm font-bold text-red-700">
                    ยกเลิกวันหยุด
                  </button>
                </form>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
