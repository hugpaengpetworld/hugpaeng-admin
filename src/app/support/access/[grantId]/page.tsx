import Link from "next/link";

import { requireSupportContext } from "@/data/auth/support-context";
import { getSupportOverview } from "@/data/platform/support-overview";

export const dynamic = "force-dynamic";

export default async function SupportAccessPage({
  params,
}: {
  readonly params: Promise<{ grantId: string }>;
}) {
  const { grantId } = await params;
  const context = await requireSupportContext(grantId);
  const metrics = await getSupportOverview(context);
  return (
    <div className="min-h-screen bg-amber-50 text-slate-950">
      <div
        role="status"
        className="sticky top-0 z-20 border-b-2 border-amber-500 bg-amber-300 px-4 py-3 text-center text-sm font-bold"
      >
        กำลังใช้ Temporary Support Access · {context.tenantName} · Ticket{" "}
        {context.ticketReference} · หมดอายุ {formatBangkok(context.expiresAt)}
      </div>
      <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
        <header>
          <Link href="/support" className="text-sm font-bold underline">
            ← กลับรายการ grant
          </Link>
          <h1 className="mt-4 text-3xl font-bold">
            Support session แบบอ่านอย่างเดียว
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            เหตุผล: {context.reason}
          </p>
        </header>
        <section className="rounded-2xl border border-amber-300 bg-white p-5">
          <h2 className="font-bold">ขอบเขตที่อนุมัติ</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {context.scopes.map((scope) => (
              <span
                key={scope}
                className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold"
              >
                {scope}
              </span>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-600">
            ระบบไม่มี write scope, refund, user management หรือ secret
            management สำหรับ support grant
          </p>
        </section>
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((metric) => (
            <article
              key={metric.scope}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <p className="text-sm font-semibold text-slate-500">
                {metric.label}
              </p>
              <p className="mt-2 text-3xl font-bold">
                {metric.value.toLocaleString("th-TH")}
              </p>
              <p className="mt-1 text-xs text-slate-400">{metric.scope}</p>
            </article>
          ))}
          {metrics.length === 0 && (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center sm:col-span-2 lg:col-span-3">
              Grant นี้อนุญาตเฉพาะข้อมูล tenant เบื้องต้น
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

function formatBangkok(value: string): string {
  return new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}
