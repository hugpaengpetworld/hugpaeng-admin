import type { ReceiptDetail } from "@/data/finance/receipts";

const paymentMethodLabels: Readonly<Record<string, string>> = {
  CASH: "เงินสด",
  TRANSFER: "โอนเงิน",
  PROMPTPAY: "พร้อมเพย์",
  CARD: "บัตร",
  OTHER: "อื่น ๆ",
  NOT_SPECIFIED: "ไม่ระบุ",
};

export function ReceiptPaper({ receipt }: { readonly receipt: ReceiptDetail }) {
  return (
    <article className="receipt-paper mx-auto w-full max-w-[80mm] bg-white p-[4mm] text-[12px] leading-relaxed text-black shadow-lg print:shadow-none">
      {receipt.status === "VOID" && (
        <div className="mb-3 border-2 border-red-700 p-2 text-center text-sm font-bold text-red-700">
          ยกเลิกแล้ว — {receipt.voidReason}
        </div>
      )}
      <header className="text-center">
        <h1 className="text-base font-bold">{receipt.clinicThaiName}</h1>
        <p>{receipt.clinicEnglishName}</p>
        {receipt.clinicAddress && (
          <p className="whitespace-pre-line">{receipt.clinicAddress}</p>
        )}
        {receipt.clinicPhone && <p>โทร {receipt.clinicPhone}</p>}
        {receipt.taxSectionEnabled && (
          <div className="mt-1">
            <p className="font-semibold">{receipt.taxHeading}</p>
            {receipt.taxId && <p>เลขผู้เสียภาษี {receipt.taxId}</p>}
            {receipt.branchNumber && <p>สาขา {receipt.branchNumber}</p>}
          </div>
        )}
        <div className="my-3 border-t border-dashed border-black" />
        <p className="font-bold">ใบเสร็จรับเงิน</p>
        <p>{receipt.receiptNo}</p>
        <p>{formatDateTime(receipt.issuedAt)}</p>
      </header>

      <dl className="my-3 grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 border-y border-dashed border-black py-3">
        <dt>ลูกค้า</dt>
        <dd className="font-semibold">{receipt.customerName}</dd>
        <dt>โทร</dt>
        <dd>{receipt.customerPhone}</dd>
        <dt>สัตว์เลี้ยง</dt>
        <dd>{receipt.petSummary}</dd>
        <dt>ห้อง</dt>
        <dd>{receipt.roomSummary}</dd>
        <dt>เช็กอิน</dt>
        <dd>{formatDateTime(receipt.actualCheckedInAt)}</dd>
        <dt>เช็กเอาต์</dt>
        <dd>{formatDateTime(receipt.actualCheckedOutAt)}</dd>
      </dl>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-1">รายการ</th>
            <th className="py-1 text-right">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {receipt.items.map((item) => (
            <tr key={item.id} className="align-top">
              <td className="py-1 pr-2">
                <strong>{item.itemName}</strong>
                {item.description && (
                  <small className="block">{item.description}</small>
                )}
              </td>
              <td className="py-1 text-right">
                {formatMoney(item.amountSatang)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mt-3 space-y-1 border-t border-dashed border-black pt-3">
        <TotalRow label="ยอดรวม" satang={receipt.totalSatang} />
        <TotalRow label="หักมัดจำ" satang={receipt.depositSatang} />
        <TotalRow
          label="รับเพิ่ม ณ เช็กเอาต์"
          satang={receipt.paidAtCheckoutSatang}
          strong
        />
        {receipt.refundDueSatang > 0 && (
          <TotalRow label="ยอดรอคืน" satang={receipt.refundDueSatang} strong />
        )}
        <div className="flex justify-between gap-3">
          <dt>วิธีชำระ</dt>
          <dd className="text-right font-semibold">
            {paymentMethodLabels[receipt.paymentMethod] ?? "ไม่ระบุ"}
          </dd>
        </div>
      </dl>
      {receipt.notes && (
        <section className="mt-3 border-t border-dashed border-black pt-3">
          <strong>หมายเหตุ</strong>
          <p>{receipt.notes}</p>
        </section>
      )}
      <p className="mt-5 text-center">ขอบคุณที่ใช้บริการ</p>
    </article>
  );
}

function TotalRow({
  label,
  satang,
  strong = false,
}: {
  readonly label: string;
  readonly satang: number;
  readonly strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-3 ${strong ? "text-sm font-bold" : ""}`}
    >
      <dt>{label}</dt>
      <dd>{formatMoney(satang)} บาท</dd>
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
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}
