import Link from "next/link";

import { listReceipts } from "@/data/finance/receipts";

export default async function FinancePage() {
  const receipts = await listReceipts();
  return (
    <div>
      <div className="mb-6">
        <p className="text-sm font-bold text-[#2d6a50]">การเงิน</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
          ใบเสร็จและการคืนเงิน
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          ใบเสร็จเป็น snapshot ณ เวลาเช็กเอาต์
          การแก้ไขใช้ยกเลิกและออกเลขใหม่เท่านั้น
        </p>
      </div>
      {receipts.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="font-bold">ยังไม่มีใบเสร็จ</h2>
          <p className="mt-2 text-sm text-slate-600">
            ใบเสร็จจะถูกสร้างอัตโนมัติเมื่อเช็กเอาต์สำเร็จ
          </p>
        </section>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-emerald-900/10 bg-white shadow-sm">
          <div className="hidden grid-cols-[1.2fr_1fr_1fr_1fr_auto] gap-4 bg-emerald-50 px-5 py-3 text-sm font-bold md:grid">
            <span>เลขที่</span>
            <span>ลูกค้า</span>
            <span>ห้อง</span>
            <span>ยอดรวม</span>
            <span>สถานะ</span>
          </div>
          {receipts.map((receipt) => (
            <Link
              key={receipt.id}
              href={`/admin/finance/receipts/${receipt.id}`}
              className="grid min-h-16 gap-2 border-t border-slate-100 px-5 py-4 hover:bg-emerald-50/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#2d6a50] md:grid-cols-[1.2fr_1fr_1fr_1fr_auto] md:items-center md:gap-4"
            >
              <div>
                <p className="font-bold">{receipt.receiptNo}</p>
                <p className="text-xs text-slate-500">
                  {formatDateTime(receipt.issuedAt)}
                </p>
              </div>
              <span>{receipt.customerName}</span>
              <span>ห้อง {receipt.roomSummary}</span>
              <span className="font-semibold">
                {formatMoney(receipt.totalSatang)} บาท
              </span>
              <span
                className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${receipt.status === "ISSUED" ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-800"}`}
              >
                {receipt.status === "ISSUED" ? "✓ ใช้งานอยู่" : "× ยกเลิกแล้ว"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function formatMoney(satang: number): string {
  return (satang / 100).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}
