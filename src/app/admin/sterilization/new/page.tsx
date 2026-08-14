import Link from "next/link";

import { SterilizationAppointmentForm } from "@/components/sterilization/appointment-form";
import { requireTenantContext } from "@/data/auth/tenant-context";
import {
  listSterilizationAppointments,
  listSterilizationHolidays,
} from "@/data/sterilization/appointments";
import { todayInBangkok } from "@/domain/shared/date";
import {
  sterilizationConsumesCapacity,
  sterilizationErrorMessage,
} from "@/domain/sterilization/rules";

export default async function NewSterilizationAppointmentPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ date?: string; error?: string }>;
}) {
  const [query, context] = await Promise.all([
    searchParams,
    requireTenantContext(),
  ]);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query.date ?? "")
    ? query.date!
    : todayInBangkok();
  const [appointments, holidays] = await Promise.all([
    listSterilizationAppointments({ date }),
    listSterilizationHolidays(date.slice(0, 7)),
  ]);
  const activeCount = appointments.filter((item) =>
    sterilizationConsumesCapacity(item.status),
  ).length;
  const holidayReason =
    holidays.find((item) => item.isActive && item.holidayDate === date)
      ?.reason ?? null;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <Link
          href="/admin/sterilization"
          className="text-sm font-bold text-[#2d6a50] underline"
        >
          ← กลับปฏิทิน
        </Link>
        <h1 className="mt-3 text-2xl font-bold sm:text-3xl">รับนัดทำหมัน</h1>
        <p className="mt-2 text-sm text-slate-600">
          สำหรับเจ้าของ สัตวแพทย์ และพนักงานหลังบ้านเท่านั้น
        </p>
      </header>
      {query.error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          {sterilizationErrorMessage(query.error)}
        </div>
      )}
      <SterilizationAppointmentForm
        defaultDate={date}
        activeCount={activeCount}
        holidayReason={holidayReason}
        canOverrideHoliday={
          context.role === "OWNER" || context.role === "DOCTOR"
        }
      />
    </div>
  );
}
