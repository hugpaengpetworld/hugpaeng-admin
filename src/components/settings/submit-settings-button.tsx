"use client";

import { useFormStatus } from "react-dom";

export function SubmitSettingsButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-12 rounded-xl bg-[#123c2f] px-6 font-bold text-white hover:bg-[#1d5540] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
    </button>
  );
}
