"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { SterilizationAppointmentForm } from "@/components/sterilization/appointment-form";
import { Icon } from "@/components/ui/icon";
import type {
  SterilizationAppointment,
  SterilizationHoliday,
} from "@/data/sterilization/appointments";
import { CHANNEL_LABELS } from "@/domain/booking/labels";
import { formatDisplayDate } from "@/domain/shared/date";
import {
  buildSterilizationMonthGrid,
  calendarDayNumber,
  formatThaiCalendarMonth,
  THAI_WEEKDAY_LABELS,
} from "@/domain/sterilization/calendar";
import {
  getSterilizationCapacityTone,
  getSterilizationPetLabel,
  STERILIZATION_DAILY_CAPACITY,
  STERILIZATION_STATUS_LABELS,
  sterilizationConsumesCapacity,
} from "@/domain/sterilization/rules";

export function SterilizationCalendarGrid({
  month,
  appointments,
  holidays,
  canOverrideHoliday,
}: {
  readonly month: string;
  readonly appointments: readonly SterilizationAppointment[];
  readonly holidays: readonly SterilizationHoliday[];
  readonly canOverrideHoliday: boolean;
}) {
  const appointmentsByDate = useMemo(() => {
    const grouped = new Map<string, SterilizationAppointment[]>();
    for (const appointment of appointments) {
      const rows = grouped.get(appointment.appointmentDate) ?? [];
      grouped.set(appointment.appointmentDate, [...rows, appointment]);
    }
    return grouped;
  }, [appointments]);
  const holidayByDate = useMemo(
    () =>
      new Map(
        holidays
          .filter((holiday) => holiday.isActive)
          .map((holiday) => [holiday.holidayDate, holiday]),
      ),
    [holidays],
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedAppointment, setSelectedAppointment] =
    useState<SterilizationAppointment | null>(null);
  const bookingDialogRef = useRef<HTMLDialogElement>(null);
  const detailDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (
      selectedDate &&
      bookingDialogRef.current &&
      !bookingDialogRef.current.open
    ) {
      bookingDialogRef.current.showModal();
    }
  }, [selectedDate]);

  useEffect(() => {
    if (
      selectedAppointment &&
      detailDialogRef.current &&
      !detailDialogRef.current.open
    ) {
      detailDialogRef.current.showModal();
    }
  }, [selectedAppointment]);

  function closeBookingDialog(): void {
    bookingDialogRef.current?.close();
    setSelectedDate(null);
  }

  function closeDetailDialog(): void {
    detailDialogRef.current?.close();
    setSelectedAppointment(null);
  }

  return (
    <>
      <section
        aria-label="ปฏิทินคิวทำหมัน"
        className="overflow-x-auto rounded-3xl border border-emerald-900/10 bg-white p-4 shadow-sm sm:p-6"
      >
        <h2 className="mb-5 text-xl font-bold sm:text-2xl">
          {formatThaiCalendarMonth(month)}
        </h2>
        <div className="min-w-[56rem]">
          <div className="grid grid-cols-7 gap-2" role="row">
            {THAI_WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                role="columnheader"
                className="px-2 py-2 text-center text-sm font-bold text-slate-600"
              >
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {buildSterilizationMonthGrid(month).map((date, index) => {
              if (!date) {
                return (
                  <div
                    key={`empty-${index}`}
                    aria-hidden="true"
                    className="min-h-44 rounded-2xl bg-slate-50/60"
                  />
                );
              }

              const rows = appointmentsByDate.get(date) ?? [];
              const activeCount = rows.filter((row) =>
                sterilizationConsumesCapacity(row.status),
              ).length;
              const tone = getSterilizationCapacityTone(activeCount);
              const holiday = holidayByDate.get(date);
              const toneClass = holiday
                ? "border-pink-300 bg-pink-200"
                : tone === "OVERBOOKED"
                  ? "border-purple-400 bg-purple-300"
                  : tone === "FULL"
                    ? "border-rose-400 bg-rose-300"
                    : "border-emerald-300 bg-[#c8ead1]";
              const availability = Math.max(
                0,
                STERILIZATION_DAILY_CAPACITY - activeCount,
              );

              return (
                <article
                  key={date}
                  className={`relative min-h-44 overflow-hidden rounded-2xl border p-3 transition hover:-translate-y-0.5 hover:shadow-md ${toneClass}`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedDate(date)}
                    aria-label={`สร้างรายการรับจองทำหมันวันที่ ${formatDisplayDate(date)}`}
                    className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-3 focus-visible:outline-offset-[-4px] focus-visible:outline-[#123c2f]"
                  />
                  <div className="pointer-events-none relative z-[1] flex items-start justify-between gap-2">
                    <span className="text-xl font-black">
                      {calendarDayNumber(date)}
                    </span>
                    <span className="rounded-full bg-white/80 px-2 py-1 text-xs font-bold">
                      {activeCount}/{STERILIZATION_DAILY_CAPACITY} ตัว
                    </span>
                  </div>
                  <p className="pointer-events-none relative z-[1] mt-2 text-xs font-semibold">
                    {holiday
                      ? `วันหยุด · ${holiday.reason}`
                      : tone === "OVERBOOKED"
                        ? `เกินคิว ${activeCount - STERILIZATION_DAILY_CAPACITY}`
                        : tone === "FULL"
                          ? "คิวเต็ม"
                          : `ว่าง ${availability}`}
                  </p>
                  <div className="relative z-[2] mt-3 space-y-1.5">
                    {rows.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => setSelectedAppointment(row)}
                        className="block w-full truncate rounded-lg bg-white/85 px-2 py-1.5 text-left text-xs font-semibold shadow-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-[#123c2f]"
                        title={`${row.appointmentTime} ${getSterilizationPetLabel(row)}`}
                        aria-label={`ดูข้อมูล ${row.petName} เจ้าของ ${row.customerName}`}
                      >
                        {getSterilizationPetLabel(row)}
                      </button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <dialog
        ref={bookingDialogRef}
        onClose={() => setSelectedDate(null)}
        className="m-auto max-h-[94vh] w-[min(96vw,900px)] rounded-3xl border-0 bg-[#f5f8f6] p-0 text-[#173f32] shadow-2xl backdrop:bg-black/55"
      >
        {selectedDate && (
          <div>
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-emerald-900/10 bg-[#dcefe4] p-5 sm:p-6">
              <div>
                <p className="text-sm font-semibold text-[#2d6a50]">
                  รับจองโดยพนักงาน
                </p>
                <h2 className="mt-1 text-2xl font-black">
                  สร้างนัดทำหมัน · {formatDisplayDate(selectedDate)}
                </h2>
              </div>
              <button
                type="button"
                aria-label="ปิดหน้ารับจองทำหมัน"
                onClick={closeBookingDialog}
                className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/70 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <Icon name="close" className="size-6" />
              </button>
            </header>
            <div className="p-4 sm:p-6">
              <SterilizationAppointmentForm
                key={selectedDate}
                defaultDate={selectedDate}
                activeCount={
                  (appointmentsByDate.get(selectedDate) ?? []).filter((row) =>
                    sterilizationConsumesCapacity(row.status),
                  ).length
                }
                holidayReason={holidayByDate.get(selectedDate)?.reason ?? null}
                canOverrideHoliday={canOverrideHoliday}
              />
            </div>
          </div>
        )}
      </dialog>

      <dialog
        ref={detailDialogRef}
        onClose={() => setSelectedAppointment(null)}
        className="m-auto max-h-[92vh] w-[min(94vw,720px)] rounded-3xl border-0 bg-white p-0 text-[#173f32] shadow-2xl backdrop:bg-black/55"
      >
        {selectedAppointment && (
          <AppointmentQuickDetail
            appointment={selectedAppointment}
            onClose={closeDetailDialog}
          />
        )}
      </dialog>
    </>
  );
}

function AppointmentQuickDetail({
  appointment,
  onClose,
}: {
  readonly appointment: SterilizationAppointment;
  readonly onClose: () => void;
}) {
  return (
    <div>
      <header className="flex items-start justify-between gap-4 bg-[#dcefe4] p-5 sm:p-6">
        <div>
          <p className="text-sm font-semibold text-[#2d6a50]">
            ข้อมูลสัตว์และเจ้าของแบบด่วน
          </p>
          <h2 className="mt-1 text-2xl font-black">{appointment.petName}</h2>
          <p className="mt-1 text-sm">{appointment.appointmentCode}</p>
        </div>
        <button
          type="button"
          aria-label="ปิดข้อมูลนัดทำหมัน"
          onClick={onClose}
          className="grid size-11 place-items-center rounded-xl bg-white/70 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="close" className="size-6" />
        </button>
      </header>
      <div className="space-y-5 p-5 sm:p-6">
        <QuickSection title="เจ้าของ">
          <Detail label="ชื่อเจ้าของ" value={appointment.customerName} />
          <Detail label="เบอร์โทรศัพท์" value={appointment.phone} />
          <Detail
            label="ช่องทาง"
            value={CHANNEL_LABELS[appointment.sourceChannel]}
          />
        </QuickSection>
        <QuickSection title="สัตว์เลี้ยง" tone="green">
          <Detail label="ชื่อ" value={appointment.petName} />
          <Detail label="ชนิด" value={speciesLabel(appointment)} />
          <Detail
            label="เพศ"
            value={appointment.sex === "MALE" ? "ผู้" : "เมีย"}
          />
          <Detail label="พันธุ์" value={appointment.breed ?? "ยังไม่ได้ระบุ"} />
          <Detail
            label="น้ำหนัก"
            value={
              appointment.weightKg === null
                ? "ยังไม่ได้ระบุ"
                : `${appointment.weightKg} กก.`
            }
          />
          <Detail label="อายุ" value={appointment.ageText ?? "ยังไม่ได้ระบุ"} />
          <Detail
            label="สถานะวัคซีน"
            value={appointment.vaccinationStatus ?? "ยังไม่ได้ระบุ"}
          />
        </QuickSection>
        <QuickSection title="รายละเอียดนัด">
          <Detail
            label="วันนัด"
            value={formatDisplayDate(appointment.appointmentDate)}
          />
          <Detail label="เวลานัด" value={`${appointment.appointmentTime} น.`} />
          <Detail
            label="สถานะ"
            value={STERILIZATION_STATUS_LABELS[appointment.status]}
          />
          {appointment.overbookAcknowledged && (
            <Detail label="การรับเกินคิว" value="ยืนยันรับเกินคิวแล้ว" />
          )}
          {appointment.holidayOverride && (
            <Detail label="วันหยุด" value="อนุมัติข้อยกเว้นวันหยุดแล้ว" />
          )}
          {appointment.notes && (
            <Detail label="หมายเหตุ" value={appointment.notes} />
          )}
        </QuickSection>
      </div>
    </div>
  );
}

function QuickSection({
  title,
  tone = "gray",
  children,
}: {
  readonly title: string;
  readonly tone?: "gray" | "green";
  readonly children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="font-bold">{title}</h3>
      <dl
        className={`mt-3 grid gap-3 rounded-2xl p-4 text-sm sm:grid-cols-2 ${tone === "green" ? "bg-emerald-50" : "bg-slate-50"}`}
      >
        {children}
      </dl>
    </section>
  );
}

function Detail({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function speciesLabel(appointment: SterilizationAppointment): string {
  if (appointment.species === "CAT") return "แมว";
  if (appointment.species === "DOG") return "สุนัข";
  return appointment.customSpecies ?? "สัตว์ชนิดอื่น";
}
