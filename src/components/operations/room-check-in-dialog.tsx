"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { checkInRoomBookingAction } from "@/app/admin/operations/actions";
import { Icon } from "@/components/ui/icon";
import type { RoomBookingQuickDetail } from "@/data/rooms/get-room-plan";
import { BOOKING_STATUS_LABELS, CHANNEL_LABELS } from "@/domain/booking/labels";
import type { BookingStatus } from "@/domain/booking/status";
import { formatDisplayDate } from "@/domain/shared/date";

export interface RoomCheckInSelection {
  readonly booking: RoomBookingQuickDetail;
  readonly roomId: string;
  readonly roomCode: string;
  readonly idempotencyKey: string;
}

export function RoomCheckInDialog({
  selection,
  returnTo,
  onClose,
}: {
  readonly selection: RoomCheckInSelection | null;
  readonly returnTo: string;
  readonly onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (selection && dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, [selection]);

  function close(): void {
    dialogRef.current?.close();
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto max-h-[92vh] w-[min(94vw,680px)] overflow-y-auto rounded-3xl border-0 bg-white p-0 text-[#173f32] shadow-2xl backdrop:bg-black/55"
    >
      {selection && (
        <form action={checkInRoomBookingAction} className="p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[#2d7a5d]">
                เช็คอินจากหน้าห้องพัก
              </p>
              <h2 className="mt-1 text-2xl font-black">
                {selection.roomCode} · {selection.booking.bookingCode}
              </h2>
            </div>
            <button
              type="button"
              aria-label="ปิดหน้าต่างเช็คอิน"
              onClick={close}
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#dcefe4] hover:bg-[#c8ead1] focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Icon name="close" className="size-6" />
            </button>
          </div>

          <input
            type="hidden"
            name="bookingId"
            value={selection.booking.bookingId}
          />
          <input type="hidden" name="roomId" value={selection.roomId} />
          <input
            type="hidden"
            name="expectedVersion"
            value={selection.booking.bookingVersion}
          />
          <input
            type="hidden"
            name="idempotencyKey"
            value={selection.idempotencyKey}
          />
          <input type="hidden" name="returnTo" value={returnTo} />

          <dl className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <Detail
              label="สถานะรายการ"
              value={
                BOOKING_STATUS_LABELS[
                  selection.booking.bookingStatus as BookingStatus
                ] ?? "กำลังดำเนินการ"
              }
            />
            <Detail
              label="ช่องทาง"
              value={
                CHANNEL_LABELS[
                  selection.booking.channel as keyof typeof CHANNEL_LABELS
                ] ?? "ช่องทางอื่น"
              }
            />
            <Detail label="เจ้าของ" value={selection.booking.customerName} />
            <Detail
              label="เบอร์โทรศัพท์"
              value={selection.booking.customerPhone}
            />
            <Detail
              label="สัตว์เลี้ยง"
              value={selection.booking.pets.map(({ name }) => name).join(" / ")}
            />
            <Detail
              label="วันเข้าพัก"
              value={formatDisplayDate(selection.booking.checkInDate)}
            />
          </dl>

          <label className="mt-5 block text-sm font-semibold">
            ยอดมัดจำรวมที่รับจริง (บาท)
            <input
              name="depositBaht"
              type="number"
              inputMode="decimal"
              min={selection.booking.channel === "LINE" ? "500" : "0"}
              step="0.01"
              defaultValue={(
                selection.booking.verifiedDepositSatang / 100
              ).toFixed(2)}
              className="form-input mt-1.5"
              required
            />
          </label>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            {selection.booking.channel === "LINE"
              ? "LINE ต้องรับมัดจำรวมของ booking group อย่างน้อย 500 บาท ระบบจะหักเพียงครั้งเดียว"
              : "กรอกยอดมัดจำรวมที่รับจริง หากไม่มีมัดจำให้ระบุ 0 บาท"}
          </p>

          <label className="mt-4 block text-sm font-semibold">
            หมายเหตุเช็คอิน (ไม่บังคับ)
            <textarea
              name="notes"
              maxLength={1500}
              className="form-input mt-1.5 min-h-24"
            />
          </label>

          <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-5">
            <button
              type="button"
              onClick={close}
              className="min-h-11 rounded-xl border border-slate-300 px-5 font-semibold"
            >
              ยกเลิก
            </button>
            <CheckInSubmitButton />
          </div>
        </form>
      )}
    </dialog>
  );
}

function CheckInSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 rounded-xl bg-[#123c2f] px-5 font-bold text-white disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "กำลังเช็คอิน…" : "ยืนยันเช็คอิน"}
    </button>
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
      <dd className="mt-1 font-medium text-slate-900">
        {value || "ยังไม่ได้ระบุ"}
      </dd>
    </div>
  );
}
