"use client";

import { useFormStatus } from "react-dom";

import { Icon } from "@/components/ui/icon";

export function LoginSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#123c2f] px-4 font-bold text-white transition hover:bg-[#1d5540] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#2d6a50] disabled:cursor-wait disabled:opacity-70"
    >
      <Icon name="home" className="size-5" />
      {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบหลังบ้าน"}
    </button>
  );
}
