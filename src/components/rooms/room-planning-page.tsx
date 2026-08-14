import Link from "next/link";

import { createRoomAction } from "@/app/admin/rooms/actions";
import { CreateRoomButton } from "@/components/rooms/create-room-button";
import { RetireRoomButton } from "@/components/rooms/retire-room-button";
import { RoomPlanningGrid } from "@/components/rooms/room-planning-grid";
import { Icon } from "@/components/ui/icon";
import { requireTenantContext } from "@/data/auth/tenant-context";
import {
  getRoomBookingQuickDetails,
  getRoomPlan,
  type RoomSpecies,
} from "@/data/rooms/get-room-plan";
import { listOperationalBookings } from "@/data/operations/list-operations";
import { ROOM_STATUS_LABELS } from "@/domain/rooms/status";
import {
  addDays,
  formatDisplayDate,
  isIsoDate,
  todayInBangkok,
} from "@/domain/shared/date";

const legend = [
  ["AVAILABLE", "#C8EAD1"],
  ["PENDING", "#F7D081"],
  ["CONFIRMED", "#FD464A"],
  ["OCCUPIED", "#FD464A"],
  ["CLEANING", "#e2e8f0"],
  ["MAINTENANCE", "#cbd5e1"],
  ["DISABLED", "#cbd5e1"],
] as const;

const roomErrorMessages: Record<string, string> = {
  invalid_input: "ข้อมูลที่ส่งมาไม่ถูกต้อง",
  VERSION_CONFLICT: "ข้อมูลห้องถูกแก้ไขโดยผู้ใช้อื่น กรุณาลองใหม่",
  OPEN_STAY_EXISTS: "ห้องนี้กำลังมีสัตว์เข้าพัก จึงเปลี่ยนเป็นว่างไม่ได้",
  REASON_REQUIRED: "กรุณาระบุเหตุผลสำหรับการปิดซ่อมหรือปิดใช้งาน",
  ROOM_STATE_UNCHANGED: "สถานะใหม่ต้องต่างจากสถานะปัจจุบัน",
  FORBIDDEN: "คุณไม่มีสิทธิ์เปลี่ยนสถานะห้อง",
  INVALID_ROOM_SPECIES: "ประเภทห้องพักไม่ถูกต้อง",
  ROOM_NUMBER_EXHAUSTED:
    "เลขห้องพักเต็มช่วงที่ระบบรองรับ กรุณาติดต่อผู้ดูแลระบบ",
  ROOM_NOT_FOUND: "ไม่พบห้องพักที่เลือก กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง",
  ROOM_ALREADY_RETIRED: "ห้องพักนี้ถูกลบออกจากการใช้งานไปแล้ว",
  RETIREMENT_REASON_REQUIRED: "กรุณาระบุเหตุผลที่ลบห้องพักอย่างน้อย 3 ตัวอักษร",
  ACTIVE_ROOM_ALLOCATION_EXISTS:
    "ห้องนี้ยังมีรายการจองที่รออนุมัติหรือยืนยันอยู่ กรุณายกเลิกรายการนั้นก่อนลบห้อง",
  ROOM_RETIRED: "ห้องพักนี้ถูกลบออกจากการใช้งานแล้ว จึงเปลี่ยนสถานะไม่ได้",
  INVALID_STATUS_TRANSITION: "สถานะปัจจุบันไม่อนุญาตให้เช็กเอาต์",
  LINE_DEPOSIT_REQUIRED:
    "รายการจาก LINE ต้องรับมัดจำรวมของ booking group อย่างน้อย 500 บาทก่อนเช็คอิน",
  LINE_ID_REQUIRED:
    "รายการจาก LINE ไม่มี LINE User ID จึงยังไม่สามารถเช็คอินได้ กรุณาตรวจข้อมูลลูกค้า",
  DEPOSIT_BELOW_VERIFIED: "ยอดมัดจำต้องไม่น้อยกว่ายอดที่ตรวจรับไว้แล้ว",
  ROOM_UNAVAILABLE:
    "ห้องนี้ถูกรับจองหรือมีรายการซ้อนแล้ว กรุณาโหลดข้อมูลและเลือกห้องใหม่",
  ROOM_NOT_READY: "ห้องนี้ยังไม่อยู่ในสถานะพร้อมใช้งาน",
  EARLY_CHECKOUT_CONFIRMATION_REQUIRED: "กรุณายืนยันการเช็กเอาต์ก่อนกำหนด",
  PROMPTPAY_PAYMENT_CONFIRMATION_REQUIRED:
    "กรุณาสร้าง QR ตามยอดล่าสุด และยืนยันว่าเงินเข้าบัญชีแล้ว",
  INVALID_CHARGE: "ค่าใช้จ่ายเพิ่มเติมไม่ถูกต้อง",
  INVALID_PAYMENT_METHOD: "วิธีชำระเงินไม่ถูกต้อง",
  IDEMPOTENCY_CONFLICT: "รายการนี้ถูกส่งด้วยข้อมูลอื่นแล้ว กรุณาเปิดใหม่",
  UNKNOWN: "ไม่สามารถเปลี่ยนสถานะห้องได้ กรุณาลองใหม่",
};

export async function RoomPlanningPage({
  species,
  searchParams,
}: {
  readonly species: RoomSpecies;
  readonly searchParams: Promise<{
    date?: string;
    success?: string;
    error?: string;
    room?: string;
  }>;
}) {
  const query = await searchParams;
  const today = todayInBangkok();
  const planDate = query.date && isIsoDate(query.date) ? query.date : today;
  const basePath =
    species === "CAT" ? "/admin/rooms/cats" : "/admin/rooms/dogs";
  const title = species === "CAT" ? "ห้องพักแมว" : "ห้องพักสุนัข";
  const context = await requireTenantContext();
  const rooms = await getRoomPlan({
    tenantId: context.tenantId,
    species,
    planDate,
  });
  const bookingIds = rooms.flatMap(({ booking_id }) =>
    booking_id ? [booking_id] : [],
  );
  const [bookingDetails, operationalBookings] = await Promise.all([
    getRoomBookingQuickDetails({
      tenantId: context.tenantId,
      bookingIds,
    }),
    listOperationalBookings(context.tenantId, { bookingIds }),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#2d6a50]">วางแผนห้องพัก</p>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold sm:text-3xl">
            <Icon name={species === "CAT" ? "cat" : "dog"} className="size-8" />
            {title}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            สถานะวันที่ {formatDisplayDate(planDate)} · เวลาอ้างอิง Asia/Bangkok
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {context.permissions.includes("ROOM_INVENTORY_MANAGE") && (
            <>
              <form action={createRoomAction}>
                <input type="hidden" name="species" value={species} />
                <input type="hidden" name="planDate" value={planDate} />
                <CreateRoomButton species={species} />
              </form>
              <RetireRoomButton
                species={species}
                planDate={planDate}
                rooms={rooms.map((room) => ({
                  id: room.room_id,
                  code: room.room_code,
                  version: room.version,
                }))}
              />
            </>
          )}
          <Link
            href={`${basePath}?date=${addDays(planDate, -1)}`}
            aria-label="วันก่อนหน้า"
            className="grid size-11 place-items-center rounded-xl border border-slate-300 bg-white hover:bg-slate-50"
          >
            <Icon name="chevron-left" className="size-5" />
          </Link>
          <Link
            href={`${basePath}?date=${today}`}
            className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold hover:bg-slate-50"
          >
            วันนี้
          </Link>
          <form action={basePath} className="flex items-center gap-2">
            <label htmlFor="room-plan-date" className="sr-only">
              เลือกวันที่
            </label>
            <input
              id="room-plan-date"
              name="date"
              type="date"
              defaultValue={planDate}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm"
            />
            <button className="min-h-11 rounded-xl bg-[#123c2f] px-4 text-sm font-semibold text-white">
              แสดง
            </button>
          </form>
          <Link
            href={`${basePath}?date=${addDays(planDate, 1)}`}
            aria-label="วันถัดไป"
            className="grid size-11 place-items-center rounded-xl border border-slate-300 bg-white hover:bg-slate-50"
          >
            <Icon name="chevron-right" className="size-5" />
          </Link>
        </div>
      </header>

      {query.success === "state_updated" && (
        <div
          role="status"
          className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          บันทึกสถานะห้องเรียบร้อยแล้ว
        </div>
      )}
      {query.success === "room_created" && (
        <div
          role="status"
          className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          เพิ่มห้องพัก {query.room ? `${query.room} ` : ""}เรียบร้อยแล้ว
        </div>
      )}
      {query.success === "room_retired" && (
        <div
          role="status"
          className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          ลบห้องพัก {query.room ? `${query.room} ` : ""}
          ออกจากการใช้งานเรียบร้อยแล้ว และเก็บประวัติเดิมไว้แล้ว
        </div>
      )}
      {query.success === "checked_out" && (
        <div
          role="status"
          className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          เช็กเอาต์เรียบร้อยแล้ว ห้องเปลี่ยนเป็นรอทำความสะอาด
        </div>
      )}
      {query.success === "checked_in" && (
        <div
          role="status"
          className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          เช็คอินเรียบร้อยแล้ว ห้องเปลี่ยนเป็นกำลังเข้าพัก
        </div>
      )}
      {query.error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          {roomErrorMessages[query.error] ??
            "ไม่สามารถเปลี่ยนสถานะห้องได้ กรุณาลองใหม่"}
        </div>
      )}

      <section
        aria-label="คำอธิบายสถานะ"
        className="flex flex-wrap gap-2 rounded-2xl border border-emerald-900/10 bg-white p-4"
      >
        {legend.map(([status, color]) => (
          <span
            key={status}
            className="inline-flex min-h-9 items-center gap-2 rounded-full border border-slate-200 px-3 text-xs font-semibold"
          >
            <span
              aria-hidden="true"
              className="size-3 rounded-full border border-black/20"
              style={{ backgroundColor: color }}
            />
            {ROOM_STATUS_LABELS[status]}
          </span>
        ))}
      </section>

      {rooms.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="font-bold">ยังไม่มีห้องในหมวดนี้</h2>
          <p className="mt-2 text-sm text-slate-600">
            ตรวจสอบ seed/migration หรือสิทธิ์ tenant แล้วลองใหม่
          </p>
        </section>
      ) : (
        <RoomPlanningGrid
          rooms={rooms}
          bookingDetails={bookingDetails}
          operationalBookings={operationalBookings}
          species={species}
          planDate={planDate}
        />
      )}
    </div>
  );
}
