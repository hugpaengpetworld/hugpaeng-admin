"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";

import { retireRoomAction } from "@/app/admin/rooms/actions";

interface RetirableRoom {
  readonly id: string;
  readonly code: string;
  readonly version: number;
}

function RetireRoomSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-red-700 px-4 text-sm font-bold text-white transition hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "กำลังลบห้องพัก..." : "ยืนยันลบห้องพัก"}
    </button>
  );
}

export function RetireRoomButton({
  species,
  planDate,
  rooms,
}: {
  readonly species: "CAT" | "DOG";
  readonly planDate: string;
  readonly rooms: readonly RetirableRoom[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const animalLabel = species === "CAT" ? "แมว" : "สุนัข";

  return (
    <>
      <button
        type="button"
        disabled={rooms.length === 0}
        onClick={() => dialogRef.current?.showModal()}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-300 bg-white px-4 text-sm font-bold text-red-700 shadow-sm transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span aria-hidden="true" className="text-xl leading-none">
          −
        </span>
        ลบห้องพัก{animalLabel}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="retire-room-title"
        className="m-auto w-[min(92vw,32rem)] rounded-2xl border-0 bg-white p-0 text-[#123c2f] shadow-2xl backdrop:bg-black/55"
      >
        <form
          action={retireRoomAction}
          onSubmit={(event) => {
            if (
              !window.confirm(
                "ยืนยันลบห้องพักนี้ออกจากการใช้งาน? ประวัติการจองเดิมจะยังถูกเก็บไว้",
              )
            ) {
              event.preventDefault();
            }
          }}
          className="space-y-5 p-6"
        >
          <input type="hidden" name="species" value={species} />
          <input type="hidden" name="planDate" value={planDate} />

          <div>
            <p className="text-sm font-semibold text-red-700">จัดการห้องพัก</p>
            <h2 id="retire-room-title" className="mt-1 text-xl font-bold">
              ลบห้องพัก{animalLabel}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              ห้องจะถูกนำออกจากหน้าวางแผน แต่ระบบจะเก็บประวัติเดิมไว้
              ไม่สามารถลบห้องที่กำลังเข้าพักหรือยังมีรายการจองค้างอยู่ได้
            </p>
          </div>

          <div>
            <label
              htmlFor="retire-room-selection"
              className="text-sm font-bold"
            >
              ห้องที่ต้องการลบ
            </label>
            <select
              id="retire-room-selection"
              name="roomSelection"
              required
              defaultValue=""
              className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:border-[#2d7a5d] focus:ring-2 focus:ring-[#2d7a5d]/20 focus:outline-none"
            >
              <option value="" disabled>
                เลือกห้องพัก
              </option>
              {rooms.map((room) => (
                <option key={room.id} value={`${room.id}|${room.version}`}>
                  {room.code}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="retirement-reason" className="text-sm font-bold">
              เหตุผลที่ลบห้องพัก
            </label>
            <textarea
              id="retirement-reason"
              name="reason"
              required
              minLength={3}
              maxLength={500}
              rows={3}
              placeholder="เช่น ยกเลิกห้องนี้ถาวร หรือปรับพื้นที่ใช้งาน"
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-[#2d7a5d] focus:ring-2 focus:ring-[#2d7a5d]/20 focus:outline-none"
            />
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold hover:bg-slate-50"
            >
              ยกเลิก
            </button>
            <RetireRoomSubmitButton />
          </div>
        </form>
      </dialog>
    </>
  );
}
