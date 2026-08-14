import Link from "next/link";

import { requestPasswordResetAction } from "@/app/(auth)/actions";
import { Icon } from "@/components/ui/icon";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  const errorMessage =
    query.error === "rate_limited"
      ? "ส่งอีเมลถี่เกินขีดจำกัด กรุณารอประมาณ 1 ชั่วโมงจากอีเมลล่าสุดแล้วลองใหม่"
      : query.error === "send_failed"
        ? "ระบบส่งอีเมลไม่สำเร็จ กรุณาลองใหม่ภายหลังหรือติดต่อผู้ดูแลระบบ"
        : query.error
          ? "กรุณากรอกอีเมลให้ถูกต้อง"
          : null;
  return (
    <section className="rounded-3xl border border-white/15 bg-white p-6 shadow-2xl sm:p-8">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#dcefe4] text-[#123c2f]">
        <Icon name="settings" className="size-7" />
      </div>
      <h1 className="mt-5 text-center text-2xl font-bold text-[#123c2f]">
        ตั้งหรือลืมรหัสผ่าน
      </h1>
      <p className="mt-2 text-center text-sm leading-6 text-slate-600">
        ระบบจะส่งลิงก์ใหม่ไปยังอีเมลของบัญชี
        กรุณาเปิดลิงก์ด้วยเบราว์เซอร์เครื่องนี้
      </p>
      {errorMessage && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {errorMessage}
        </div>
      )}
      <form action={requestPasswordResetAction} className="mt-6 space-y-5">
        <div>
          <label
            htmlFor="recovery-email"
            className="mb-1.5 block text-sm font-semibold text-slate-800"
          >
            อีเมล
          </label>
          <input
            id="recovery-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            required
            className="min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base transition outline-none focus:border-[#2d6a50] focus:ring-3 focus:ring-[#2d6a50]/15"
          />
        </div>
        <button className="min-h-12 w-full rounded-xl bg-[#123c2f] px-4 font-bold text-white transition hover:bg-[#1d5540] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#2d6a50]">
          ส่งลิงก์ตั้งรหัสผ่านใหม่
        </button>
      </form>
      <Link
        href="/admin/login"
        className="mt-5 block min-h-11 rounded-xl px-3 py-3 text-center text-sm font-semibold text-[#2d6a50] underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#2d6a50]"
      >
        กลับหน้าเข้าสู่ระบบ
      </Link>
    </section>
  );
}
