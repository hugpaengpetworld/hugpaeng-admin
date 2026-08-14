"use client";

import { useRef } from "react";

export function BookingDetailDialog({
  bookingCode,
  roomCode,
  statusLabel,
  children,
}: {
  readonly bookingCode: string;
  readonly roomCode: string;
  readonly statusLabel: string;
  readonly children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  function close() {
    dialogRef.current?.close();
    openerRef.current?.focus();
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold">{bookingCode}</p>
          <p className="text-sm text-slate-600">ห้อง {roomCode}</p>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
          {statusLabel}
        </span>
      </div>
      <button
        ref={openerRef}
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="mt-4 min-h-11 w-full rounded-xl border border-[#123c2f] font-bold text-[#123c2f]"
      >
        ดูรายละเอียดและดำเนินการ
      </button>
      <dialog
        ref={dialogRef}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        className="m-auto max-h-[92vh] w-[min(680px,calc(100%-2rem))] overflow-y-auto rounded-2xl border-0 bg-white p-0 text-[#173f32] shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-4 sm:p-5">
          <div>
            <p className="font-bold">{bookingCode}</p>
            <p className="text-sm text-slate-600">ห้อง {roomCode}</p>
          </div>
          <button
            type="button"
            onClick={close}
            className="min-h-11 rounded-xl px-4 font-bold hover:bg-slate-100"
          >
            ปิด
          </button>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </dialog>
    </div>
  );
}
