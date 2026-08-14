"use client";

export function PrintReceiptButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="min-h-11 rounded-xl bg-[#123c2f] px-5 font-bold text-white print:hidden"
    >
      พิมพ์ใบเสร็จ 80 มม.
    </button>
  );
}
