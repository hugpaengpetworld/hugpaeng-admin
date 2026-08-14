"use client";

import { useFormStatus } from "react-dom";

export function BookingSubmitButton({
  allowDirectCheckIn = false,
}: {
  readonly allowDirectCheckIn?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap justify-end gap-3">
      <button
        type="submit"
        name="intent"
        value="request"
        disabled={pending}
        className="min-h-12 rounded-xl border border-[#123c2f] bg-white px-6 font-bold text-[#123c2f] disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "กำลังบันทึก…" : "สร้างคำขอจอง"}
      </button>
      {allowDirectCheckIn && (
        <button
          type="submit"
          name="intent"
          value="check_in"
          disabled={pending}
          className="min-h-12 rounded-xl bg-[#123c2f] px-6 font-bold text-white disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "กำลังเช็คอิน…" : "เช็คอินทันที"}
        </button>
      )}
    </div>
  );
}
