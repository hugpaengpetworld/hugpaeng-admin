import Link from "next/link";
import { redirect } from "next/navigation";

import { loginAction } from "@/app/(auth)/actions";
import { LoginSubmitButton } from "@/components/auth/login-submit-button";
import { Icon } from "@/components/ui/icon";
import { getPublicBranding } from "@/data/settings/public-branding";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AdminLoginSearchParams {
  readonly error?: string;
  readonly reason?: string;
  readonly signed_out?: string;
  readonly recovery_sent?: string;
}

const errorMessages: Record<string, string> = {
  invalid_input: "กรุณากรอกอีเมลและรหัสผ่านให้ครบ",
  invalid_credentials: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  callback: "ลิงก์เข้าสู่ระบบไม่ถูกต้องหรือหมดอายุ",
};

export async function AdminLoginScreen({
  searchParams,
}: {
  readonly searchParams: Promise<AdminLoginSearchParams>;
}) {
  const query = await searchParams;
  const branding = await getPublicBranding();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) redirect("/admin");

  const errorMessage = query.error
    ? (errorMessages[query.error] ?? "ไม่สามารถเข้าสู่ระบบได้ กรุณาลองอีกครั้ง")
    : query.reason === "session"
      ? "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง"
      : null;

  return (
    <section className="overflow-hidden rounded-3xl border border-white/15 bg-white shadow-2xl lg:grid lg:grid-cols-[0.92fr_1.08fr]">
      <div className="relative hidden overflow-hidden bg-[#1b503d] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="absolute -top-20 -right-20 size-64 rounded-full bg-[#8ac5a6]/25 blur-3xl"
        />
        <div className="relative">
          <p className="text-xs font-bold tracking-[0.2em] text-emerald-100">
            ระบบสำหรับผู้ดูแล
          </p>
          <h1 className="mt-5 text-3xl leading-tight font-black">
            ระบบหลังบ้านสำหรับจัดการงานคลินิก
          </h1>
          <p className="mt-4 text-sm leading-7 text-emerald-50/85">
            เข้าถึงรายการจอง ห้องพัก คิวทำหมัน และการเงินตามบทบาทที่ได้รับอนุญาต
          </p>
        </div>

        <div className="relative space-y-3 text-sm text-emerald-50">
          <SecurityPoint text="ข้อมูลแยกตามคลินิกและสิทธิ์ผู้ใช้งาน" />
          <SecurityPoint text="ตรวจสอบสถานะห้องพักจากข้อมูลจริง" />
          <SecurityPoint text="บันทึกการทำรายการสำคัญเพื่อการตรวจสอบ" />
        </div>
      </div>

      <div className="p-6 sm:p-9 lg:p-11">
        <div className="flex items-center gap-4">
          {branding.logoUrl ? (
            // This short-lived URL is created server-side from the private tenant bucket.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt={`โลโก้ ${branding.thaiName}`}
              className="size-16 rounded-2xl border border-slate-200 bg-white object-contain p-1"
            />
          ) : (
            <div className="grid size-16 place-items-center rounded-2xl bg-[#123c2f] text-lg font-black text-white">
              BMP
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-[0.16em] text-[#2d6a50]">
              BMP BOOKING
            </p>
            <p className="mt-1 truncate text-sm text-slate-600">
              {branding.thaiName}
            </p>
          </div>
        </div>

        <div className="mt-7">
          <p className="text-sm font-semibold text-[#2d6a50]">
            สำหรับเจ้าของ สัตวแพทย์ และพนักงาน
          </p>
          <h2 className="mt-1 text-2xl font-black text-[#123c2f] sm:text-3xl">
            เข้าสู่ระบบหลังบ้าน
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            ใช้อีเมลและรหัสผ่านของบัญชีที่ได้รับเชิญจากคลินิก
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {errorMessage}
          </div>
        )}
        {query.signed_out === "1" && (
          <div
            role="status"
            className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
          >
            ออกจากระบบเรียบร้อยแล้ว
          </div>
        )}
        {query.recovery_sent === "1" && (
          <div
            role="status"
            className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-800"
          >
            หากอีเมลนี้มีบัญชี ระบบได้ส่งลิงก์ตั้งรหัสผ่านใหม่แล้ว
            กรุณาตรวจกล่องจดหมายและโฟลเดอร์สแปม
          </div>
        )}

        <form action={loginAction} className="mt-6 space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-semibold text-slate-800"
            >
              อีเมล
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base transition outline-none focus:border-[#2d6a50] focus:ring-3 focus:ring-[#2d6a50]/15"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-semibold text-slate-800"
            >
              รหัสผ่าน
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base transition outline-none focus:border-[#2d6a50] focus:ring-3 focus:ring-[#2d6a50]/15"
            />
          </div>
          <LoginSubmitButton />
        </form>

        <div className="mt-4 flex flex-col gap-1 text-center text-sm sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/auth/forgot-password"
            className="min-h-11 rounded-xl px-2 py-3 font-semibold text-[#2d6a50] underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#2d6a50]"
          >
            คำเชิญหมดอายุ หรือลืมรหัสผ่าน
          </Link>
          <Link
            href="/"
            className="min-h-11 rounded-xl px-2 py-3 font-semibold text-slate-600 underline-offset-4 hover:text-[#2d6a50] hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#2d6a50]"
          >
            กลับเว็บไซต์สำหรับลูกค้า
          </Link>
        </div>
      </div>
    </section>
  );
}

function SecurityPoint({ text }: { readonly text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white/10">
        <Icon name="sparkle" className="size-3.5" />
      </span>
      <span>{text}</span>
    </div>
  );
}
