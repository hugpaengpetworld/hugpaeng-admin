"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin route failed", {
      digest: error.digest,
      name: error.name,
    });
  }, [error]);

  return (
    <section
      role="alert"
      className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm"
    >
      <h1 className="text-xl font-bold text-slate-950">โหลดข้อมูลไม่สำเร็จ</h1>
      <p className="mt-2 text-sm text-slate-600">
        ระบบไม่สามารถแสดงข้อมูลส่วนนี้ได้ กรุณาลองอีกครั้ง
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 min-h-11 rounded-xl bg-[#123c2f] px-5 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123c2f]"
      >
        ลองอีกครั้ง
      </button>
    </section>
  );
}
