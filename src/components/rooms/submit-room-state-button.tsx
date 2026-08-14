"use client";

import { useFormStatus } from "react-dom";

export function SubmitRoomStateButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 rounded-xl bg-[#123c2f] px-5 font-semibold text-white hover:bg-[#1d5540] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "กำลังบันทึก…" : "บันทึกสถานะ"}
    </button>
  );
}
