import { setPasswordAction } from "@/app/(auth)/actions";
import { Icon } from "@/components/ui/icon";
import { requireTenantContext } from "@/data/auth/tenant-context";

export const dynamic = "force-dynamic";

export default async function SetPasswordPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ error?: string }>;
}) {
  await requireTenantContext();
  const query = await searchParams;
  return (
    <section className="rounded-3xl border border-white/15 bg-white p-6 shadow-2xl sm:p-8">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#dcefe4] text-[#123c2f]">
        <Icon name="settings" className="size-7" />
      </div>
      <h1 className="mt-5 text-center text-2xl font-bold">ตั้งรหัสผ่านใหม่</h1>
      <p className="mt-2 text-center text-sm leading-6 text-slate-600">
        ใช้อย่างน้อย 12 ตัวอักษร และไม่ใช้รหัสผ่านจากระบบเดิม
      </p>
      {query.error && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          ไม่สามารถตั้งรหัสผ่านได้ กรุณาตรวจสอบว่ารหัสผ่านตรงกันและยาวอย่างน้อย
          12 ตัวอักษร
        </div>
      )}
      <form action={setPasswordAction} className="mt-6 space-y-5">
        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-sm font-semibold"
          >
            รหัสผ่านใหม่
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            className="min-h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-[#2d6a50] focus:ring-3 focus:ring-[#2d6a50]/15"
          />
        </div>
        <div>
          <label
            htmlFor="confirmPassword"
            className="mb-1.5 block text-sm font-semibold"
          >
            ยืนยันรหัสผ่านใหม่
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            className="min-h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-[#2d6a50] focus:ring-3 focus:ring-[#2d6a50]/15"
          />
        </div>
        <button className="min-h-12 w-full rounded-xl bg-[#123c2f] px-4 font-bold text-white hover:bg-[#1d5540] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#2d6a50]">
          บันทึกรหัสผ่าน
        </button>
      </form>
    </section>
  );
}
