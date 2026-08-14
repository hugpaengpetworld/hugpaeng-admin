import Link from "next/link";

import { BookingDetailDialog } from "@/components/bookings/booking-detail-dialog";
import {
  decideRescheduleAction,
  reviewBookingAction,
  verifyDepositAction,
} from "@/app/admin/bookings/actions";
import {
  listBookingGroups,
  listPendingReschedules,
} from "@/data/bookings/list-bookings";
import {
  requirePermission,
  requireTenantContext,
} from "@/data/auth/tenant-context";
import { formatDisplayDate } from "@/domain/shared/date";
import { BOOKING_STATUS_LABELS, CHANNEL_LABELS } from "@/domain/booking/labels";
import type { BookingStatus } from "@/domain/booking/status";

export default async function BookingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    success?: string;
    error?: string;
    q?: string;
    species?: string;
    status?: string;
  }>;
}) {
  const [groups, reschedules, query, context] = await Promise.all([
    listBookingGroups(),
    listPendingReschedules(),
    searchParams,
    requireTenantContext(),
  ]);
  requirePermission(context, "BOOKINGS_READ");
  const canVerifyDeposit = context.permissions.includes("PAYMENTS_VERIFY");
  const search = query.q?.trim().toLocaleLowerCase("th") ?? "";
  const visibleGroups = groups.filter((group) => {
    const matchingUnits = group.units.filter(
      (unit) =>
        (!query.species ||
          query.species === "ALL" ||
          unit.species === query.species) &&
        (!query.status ||
          query.status === "ALL" ||
          unit.status === query.status),
    );
    if (matchingUnits.length === 0) return false;
    if (!search) return true;
    return [
      group.customerName,
      group.customerPhone,
      ...matchingUnits.flatMap((unit) => [
        unit.bookingCode,
        unit.roomCode,
        ...unit.pets.map(({ name }) => name),
      ]),
    ].some((value) => value.toLocaleLowerCase("th").includes(search));
  });
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#2d6a50]">ฝากเลี้ยง</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
            รายการจองฝากเลี้ยง
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            แสดงล่าสุด 100 รายการ แต่ละห้องมีสถานะและสัตว์ของตนเอง
          </p>
        </div>
        <Link
          href="/admin/bookings/new"
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#123c2f] px-5 font-bold text-white"
        >
          + สร้างการจอง
        </Link>
      </header>

      {query.success === "created" && (
        <div
          role="status"
          className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          สร้างคำขอจองและกันห้องเรียบร้อยแล้ว
        </div>
      )}
      {query.success && query.success !== "created" && (
        <div
          role="status"
          className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          ดำเนินการเรียบร้อยแล้ว ข้อมูลสถานะถูกบันทึกถาวร
        </div>
      )}
      {query.error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          {bookingErrorMessage(query.error)}
        </div>
      )}

      <form
        method="get"
        className="grid gap-3 rounded-2xl border border-emerald-900/10 bg-white p-4 sm:grid-cols-4"
      >
        <label className="text-sm font-semibold sm:col-span-2">
          ค้นหารหัส เจ้าของ โทรศัพท์ สัตว์ หรือห้อง
          <input
            name="q"
            defaultValue={query.q}
            className="form-input mt-1.5"
            placeholder="เช่น BMP-..., ชาไทย, CAT01"
          />
        </label>
        <label className="text-sm font-semibold">
          ชนิดสัตว์
          <select
            name="species"
            defaultValue={query.species ?? "ALL"}
            className="form-input mt-1.5"
          >
            <option value="ALL">ทั้งหมด</option>
            <option value="CAT">แมว</option>
            <option value="DOG">สุนัข</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          สถานะ
          <select
            name="status"
            defaultValue={query.status ?? "ALL"}
            className="form-input mt-1.5"
          >
            <option value="ALL">ทั้งหมด</option>
            <option value="PENDING_APPROVAL">รอตรวจสอบ</option>
            <option value="APPROVED_AWAITING_DEPOSIT">รอมัดจำ</option>
            <option value="CONFIRMED">ยืนยันแล้ว</option>
            <option value="REJECTED">ไม่อนุมัติ</option>
            <option value="EXPIRED_PAYMENT">หมดเวลาชำระ</option>
          </select>
        </label>
        <button className="min-h-11 rounded-xl bg-[#123c2f] px-4 font-bold text-white sm:col-start-4">
          กรองรายการ
        </button>
      </form>

      {reschedules.length > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <h2 className="text-lg font-bold">คำขอเลื่อนวันที่รอตรวจสอบ</h2>
          <div className="mt-4 space-y-3">
            {reschedules.map((request) => (
              <form
                key={request.id}
                action={decideRescheduleAction}
                className="rounded-xl border border-amber-200 bg-white p-4"
              >
                <input type="hidden" name="requestId" value={request.id} />
                <p className="font-bold">{request.customerName}</p>
                <p className="mt-1 text-sm text-slate-600">
                  เดิม {formatDisplayDate(request.oldCheckInDate)}–
                  {formatDisplayDate(request.oldCheckOutDate)} → ใหม่{" "}
                  {formatDisplayDate(request.newCheckInDate)}–
                  {formatDisplayDate(request.newCheckOutDate)}
                </p>
                {request.reason && (
                  <p className="mt-2 text-sm">เหตุผล: {request.reason}</p>
                )}
                <input
                  name="reason"
                  className="form-input mt-3"
                  placeholder="เหตุผลเมื่อไม่อนุมัติ"
                  maxLength={500}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    name="decision"
                    value="APPROVE"
                    className="min-h-11 rounded-xl bg-[#123c2f] px-4 font-bold text-white"
                  >
                    อนุมัติและย้ายการกันห้อง
                  </button>
                  <button
                    name="decision"
                    value="REJECT"
                    className="min-h-11 rounded-xl border border-red-300 px-4 font-bold text-red-700"
                  >
                    ไม่อนุมัติ
                  </button>
                </div>
              </form>
            ))}
          </div>
        </section>
      )}

      {visibleGroups.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="font-bold">ไม่พบรายการจอง</h2>
          <p className="mt-2 text-sm text-slate-600">
            เริ่มสร้างรายการจากปุ่มด้านบน หรือส่งคำขอจากหน้าสาธารณะ
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          {visibleGroups.map((group) => (
            <article
              key={group.id}
              className="rounded-2xl border border-emerald-900/10 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-lg font-bold">{group.customerName}</h2>
                  <p className="text-sm text-slate-600">
                    {group.customerPhone} ·{" "}
                    {CHANNEL_LABELS[
                      group.channel as keyof typeof CHANNEL_LABELS
                    ] ?? "ช่องทางอื่น"}
                  </p>
                </div>
                <p className="text-sm font-semibold text-[#2d6a50]">
                  {formatDisplayDate(group.checkInDate)} →{" "}
                  {formatDisplayDate(group.checkOutDate)}
                </p>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {group.units.map((unit) => (
                  <BookingDetailDialog
                    key={unit.id}
                    bookingCode={unit.bookingCode}
                    roomCode={unit.roomCode}
                    statusLabel={
                      BOOKING_STATUS_LABELS[unit.status as BookingStatus] ??
                      "กำลังดำเนินการ"
                    }
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-bold">{unit.bookingCode}</p>
                        <p className="text-sm text-slate-600">
                          ห้อง {unit.roomCode}
                        </p>
                      </div>
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
                        {BOOKING_STATUS_LABELS[unit.status as BookingStatus] ??
                          "กำลังดำเนินการ"}
                      </span>
                    </div>
                    <ul className="mt-3 space-y-1 text-sm">
                      {unit.pets.map((pet, index) => (
                        <li key={`${pet.name}-${index}`}>
                          {pet.name} ({pet.species === "CAT" ? "แมว" : "สุนัข"})
                          {pet.weightKg ? ` · ${pet.weightKg} กก.` : ""}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-sm font-semibold">
                      ค่าที่พัก{" "}
                      {(unit.lodgingTotalSatang / 100).toLocaleString("th-TH")}{" "}
                      บาท
                    </p>
                    {unit.status === "PENDING_APPROVAL" && (
                      <form
                        action={reviewBookingAction}
                        className="mt-4 border-t border-slate-200 pt-4"
                      >
                        <input type="hidden" name="bookingId" value={unit.id} />
                        <input
                          type="hidden"
                          name="expectedVersion"
                          value={unit.version}
                        />
                        <input
                          name="reason"
                          className="form-input"
                          placeholder="เหตุผลเมื่อไม่อนุมัติ"
                          maxLength={500}
                        />
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            name="decision"
                            value="APPROVE"
                            className="min-h-11 rounded-xl bg-[#123c2f] px-4 text-sm font-bold text-white"
                          >
                            อนุมัติ
                          </button>
                          <button
                            name="decision"
                            value="REJECT"
                            className="min-h-11 rounded-xl border border-red-300 px-4 text-sm font-bold text-red-700"
                          >
                            ไม่อนุมัติ
                          </button>
                        </div>
                      </form>
                    )}
                    {unit.status === "APPROVED_AWAITING_DEPOSIT" &&
                      unit.id ===
                        group.units.find(
                          ({ status }) =>
                            status === "APPROVED_AWAITING_DEPOSIT",
                        )?.id && (
                        <div className="mt-4 border-t border-slate-200 pt-4 text-sm">
                          <p className="font-semibold">
                            สถานะมัดจำรวมของ booking group:{" "}
                            {unit.paymentStatus === "SUBMITTED"
                              ? "ส่งหลักฐานแล้ว"
                              : "รอหลักฐาน"}
                          </p>
                          {unit.depositDeadlineAt && (
                            <p className="mt-1 text-slate-600">
                              กำหนดชำระ{" "}
                              {new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
                                dateStyle: "short",
                                timeStyle: "short",
                                timeZone: "Asia/Bangkok",
                              }).format(new Date(unit.depositDeadlineAt))}
                            </p>
                          )}
                          {unit.evidenceUrl && (
                            <a
                              href={unit.evidenceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-3 inline-flex min-h-11 items-center font-bold text-[#2d6a50] underline"
                            >
                              เปิดหลักฐานมัดจำ
                            </a>
                          )}
                          {canVerifyDeposit &&
                            unit.paymentStatus === "SUBMITTED" &&
                            unit.paymentId && (
                              <form
                                action={verifyDepositAction}
                                className="mt-2"
                              >
                                <input
                                  type="hidden"
                                  name="paymentId"
                                  value={unit.paymentId}
                                />
                                <input
                                  type="hidden"
                                  name="expectedVersion"
                                  value={unit.version}
                                />
                                <button className="min-h-11 rounded-xl bg-[#123c2f] px-4 font-bold text-white">
                                  ตรวจรับมัดจำรวม 500 บาท
                                </button>
                              </form>
                            )}
                        </div>
                      )}
                  </BookingDetailDialog>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function bookingErrorMessage(code: string): string {
  const messages: Readonly<Record<string, string>> = {
    VERSION_CONFLICT: "รายการถูกแก้ไขโดยผู้ใช้อื่น กรุณารีเฟรชแล้วลองใหม่",
    INVALID_STATUS_TRANSITION: "สถานะปัจจุบันไม่อนุญาตให้ดำเนินการนี้",
    REASON_REQUIRED: "กรุณาระบุเหตุผล",
    LINE_ID_REQUIRED: "รายการ LINE ไม่มี LINE user ID จึงยังอนุมัติไม่ได้",
    PAYMENT_DEADLINE_EXPIRED: "รายการหมดเวลาชำระมัดจำแล้ว",
    ROOM_UNAVAILABLE: "ห้องไม่ว่างในช่วงใหม่ รายการเดิมยังไม่ถูกเปลี่ยน",
    RESCHEDULE_LIMIT_REACHED: "รายการนี้ใช้สิทธิ์เลื่อนวันแล้ว",
    VALIDATION_ERROR: "ข้อมูลที่ส่งมาไม่ถูกต้อง",
    UNKNOWN: "ดำเนินการไม่สำเร็จ กรุณาลองใหม่",
  };
  return messages[code] ?? messages.UNKNOWN!;
}
