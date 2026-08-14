import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { PublicBookingPortal } from "@/components/public/public-booking-portal";
import { PublicBookingTools } from "@/components/public/public-booking-tools";
import { getPublicBranding } from "@/data/settings/public-branding";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const branding = await getPublicBranding();
  return (
    <main className="min-h-screen bg-[#f5f8f6]">
      <header className="border-b border-emerald-900/10 bg-white">
        <div className="mx-auto flex min-h-18 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            {branding.logoUrl ? (
              // This short-lived URL is created server-side from the private tenant bucket.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt={`โลโก้ ${branding.thaiName}`}
                className="size-11 rounded-xl border border-slate-200 bg-white object-contain p-1"
              />
            ) : (
              <div className="grid size-11 place-items-center rounded-xl bg-[#123c2f] text-sm font-black text-white">
                BMP
              </div>
            )}
            <div>
              <p className="text-sm font-bold text-[#123c2f]">
                {branding.thaiName}
              </p>
              <p className="text-xs text-slate-500">{branding.englishName}</p>
            </div>
          </div>
          <Link
            href="/admin/login"
            className="inline-flex min-h-11 items-center rounded-xl bg-[#123c2f] px-4 text-sm font-bold text-white hover:bg-[#1d5540] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#2d6a50]"
          >
            เข้าสู่ระบบ
          </Link>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-72px)] max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.15fr_.85fr]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-[#dcefe4] px-3 py-1.5 text-xs font-bold text-[#123c2f]">
            <Icon name="sparkle" className="size-4" />
            ระบบใหม่ · ไม่ใช้ Google Sheets
          </p>
          <h1 className="mt-5 max-w-2xl text-4xl leading-tight font-black text-[#123c2f] sm:text-5xl">
            จัดการห้องพักสัตว์อย่างชัดเจน ปลอดภัย และไม่ปล่อยห้องก่อนเช็กเอาต์
          </h1>
          <p className="mt-5 max-w-xl text-base leading-8 text-slate-600">
            BMP Booking แยกแผนการจองออกจากการเข้าพักจริง รองรับหลาย tenant
            และบังคับสิทธิ์ด้วย Supabase RLS ตั้งแต่ฐานข้อมูล
          </p>
          <Link
            href="/admin/login"
            className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#123c2f] px-6 font-bold text-white hover:bg-[#1d5540] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#2d6a50]"
          >
            <Icon name="home" className="size-5" />
            เข้าสู่ระบบหลังบ้าน
          </Link>
        </div>

        <div className="space-y-6">
          <PublicBookingPortal />
          <PublicBookingTools />
        </div>
      </section>
    </main>
  );
}
