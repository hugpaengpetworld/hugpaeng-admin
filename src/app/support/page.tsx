import Link from "next/link";

import { logoutAction } from "@/app/(auth)/actions";
import { requirePlatformContext } from "@/data/auth/platform-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SupportGrantsPage() {
  const context = await requirePlatformContext();
  if (context.role !== "SUPPORT_AGENT")
    return (
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-bold">Support Access</h1>
        <p className="mt-3">บัญชีนี้ไม่ใช่ Support Agent</p>
      </div>
    );
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("support_access_grants")
    .select("id, reason, ticket_reference, starts_at, expires_at, status")
    .eq("support_user_id", context.userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("SUPPORT_GRANTS_UNAVAILABLE");
  const grants = (data ?? []) as {
    id: string;
    reason: string;
    ticket_reference: string;
    starts_at: string;
    expires_at: string;
    status: string;
  }[];
  return (
    <div className="min-h-screen bg-amber-50 p-4 text-slate-950 sm:p-8">
      <main className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-2xl border-2 border-amber-400 bg-white p-6">
          <p className="text-sm font-bold text-amber-800">
            พื้นที่ Temporary Support Access
          </p>
          <h1 className="mt-1 text-2xl font-bold">
            Grant ของ {context.displayName}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            ทุกครั้งที่เปิด grant ระบบจะบันทึกเวลา ผู้ใช้ tenant และ grant ID ลง
            Audit Log
          </p>
          <form action={logoutAction} className="mt-4">
            <button className="min-h-11 rounded-xl border border-slate-300 px-4 font-bold">
              ออกจากระบบ
            </button>
          </form>
        </header>
        <section className="space-y-3">
          {grants.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              ยังไม่มี grant สำหรับบัญชีนี้
            </p>
          ) : (
            grants.map((grant) => (
              <article
                key={grant.id}
                className="rounded-2xl border border-slate-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">Ticket {grant.ticket_reference}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {grant.reason}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">
                    {grant.status}
                  </span>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  หมดอายุ {formatBangkok(grant.expires_at)}
                </p>
                {grant.status === "ACTIVE" &&
                  new Date(grant.starts_at) <= new Date() &&
                  new Date(grant.expires_at) > new Date() && (
                    <Link
                      href={`/support/access/${grant.id}`}
                      className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-amber-600 px-4 font-bold text-white"
                    >
                      เข้าสู่ support session
                    </Link>
                  )}
              </article>
            ))
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
