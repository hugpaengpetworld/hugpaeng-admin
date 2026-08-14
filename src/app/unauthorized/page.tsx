import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f8f6] px-4">
      <section className="max-w-md rounded-2xl border border-amber-300 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-bold text-amber-700">ไม่มีสิทธิ์เข้าถึง</p>
        <h1 className="mt-2 text-2xl font-bold text-[#123c2f]">
          บัญชีนี้ยังไม่มีสิทธิ์ในคลินิก
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          กรุณาติดต่อเจ้าของคลินิกเพื่อตรวจสอบ tenant membership หรือสถานะคำเชิญ
        </p>
        <Link
          href="/admin/login"
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-[#123c2f] px-5 font-semibold text-white"
        >
          กลับหน้าเข้าสู่ระบบ
        </Link>
      </section>
    </main>
  );
}
