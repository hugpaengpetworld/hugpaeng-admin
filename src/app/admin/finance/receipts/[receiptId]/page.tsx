import Link from "next/link";
import { notFound } from "next/navigation";

import {
  recordDepositSourceAction,
  recordRefundAction,
  regenerateReceiptArtifactAction,
  reissueReceiptAction,
  voidReceiptAction,
} from "@/app/admin/finance/actions";
import { requireTenantContext } from "@/data/auth/tenant-context";
import { getReceiptDetail } from "@/data/finance/receipts";

const successMessages: Readonly<Record<string, string>> = {
  checked_out: "เช็กเอาต์และสร้างใบเสร็จสำเร็จแล้ว",
  source_account_recorded: "บันทึกหลักฐานบัญชีต้นทางแล้ว",
  refund_recorded: "บันทึกการคืนเงินแล้ว",
  voided: "ยกเลิกใบเสร็จแล้ว",
  reissued: "ยกเลิกใบเดิมและออกใบเสร็จเลขใหม่แล้ว",
  artifact_queued: "ขอสร้างเอกสารใหม่แล้ว สามารถเปิดหน้าพิมพ์ซ้ำได้",
};

const errorMessages: Readonly<Record<string, string>> = {
  FORBIDDEN: "บัญชีนี้ไม่มีสิทธิ์ทำรายการ",
  ORIGINAL_ACCOUNT_EVIDENCE_REQUIRED:
    "ต้องบันทึกชื่อบัญชีและเลขท้าย 4 หลักของเงินมัดจำก่อนคืนเงิน",
  REFUND_ACCOUNT_MISMATCH:
    "ชื่อบัญชีหรือเลขท้าย 4 หลักไม่ตรงกับบัญชีที่โอนมัดจำ",
  REFUND_NOT_DUE: "รายการนี้ไม่มียอดที่ต้องคืน",
  REASON_REQUIRED: "กรุณาระบุเหตุผล",
  RECEIPT_ALREADY_VOID: "ใบเสร็จนี้ถูกยกเลิกแล้ว",
  VALIDATION_ERROR: "ข้อมูลไม่ถูกต้อง",
  UNKNOWN: "ดำเนินการไม่สำเร็จ กรุณาลองใหม่",
};

export default async function ReceiptDetailPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ receiptId: string }>;
  readonly searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [{ receiptId }, query, context] = await Promise.all([
    params,
    searchParams,
    requireTenantContext(),
  ]);
  const receipt = await getReceiptDetail(receiptId);
  if (!receipt) notFound();
  const canRecordSource = context.permissions.includes("PAYMENTS_VERIFY");
  const canRefund = context.permissions.includes("REFUNDS_MANAGE");
  const canManageReceipt = context.permissions.includes("RECEIPTS_MANAGE");

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/admin/finance"
        className="inline-flex min-h-11 items-center font-bold text-[#2d6a50] underline"
      >
        ← กลับรายการใบเสร็จ
      </Link>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-bold text-[#2d6a50]">ใบเสร็จรับเงิน</p>
          <h1 className="mt-1 text-2xl font-bold">{receipt.receiptNo}</h1>
          <p className="mt-1 text-sm text-slate-600">
            ออกเมื่อ {formatDateTime(receipt.issuedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/finance/receipts/${receipt.id}/print`}
            className="inline-flex min-h-11 items-center rounded-xl bg-[#123c2f] px-5 font-bold text-white"
          >
            เปิดหน้าพิมพ์ 80 มม.
          </Link>
          <form action={regenerateReceiptArtifactAction}>
            <input type="hidden" name="receiptId" value={receipt.id} />
            <button className="min-h-11 rounded-xl border border-[#123c2f] px-4 font-bold">
              สร้างเอกสารใหม่
            </button>
          </form>
        </div>
      </div>

      {query.success && successMessages[query.success] && (
        <p
          role="status"
          className="mt-5 rounded-xl border border-emerald-300 bg-emerald-50 p-4 font-semibold text-emerald-900"
        >
          ✓ {successMessages[query.success]}
        </p>
      )}
      {query.error && (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-red-300 bg-red-50 p-4 font-semibold text-red-900"
        >
          ! {errorMessages[query.error] ?? errorMessages.UNKNOWN}
        </p>
      )}
      {receipt.status === "VOID" && (
        <p className="mt-5 rounded-xl border border-red-300 bg-red-50 p-4 font-bold text-red-800">
          × ใบเสร็จนี้ถูกยกเลิก: {receipt.voidReason}
        </p>
      )}

      <section className="mt-6 rounded-2xl border border-emerald-900/10 bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Fact
            label="ลูกค้า"
            value={`${receipt.customerName} · ${receipt.customerPhone}`}
          />
          <Fact label="สัตว์เลี้ยง" value={receipt.petSummary} />
          <Fact label="ห้อง" value={receipt.roomSummary} />
          <Fact
            label="เช็กอินจริง"
            value={formatDateTime(receipt.actualCheckedInAt)}
          />
          <Fact
            label="เช็กเอาต์จริง"
            value={formatDateTime(receipt.actualCheckedOutAt)}
          />
          <Fact
            label="สถานะเอกสาร"
            value={`${receipt.status === "ISSUED" ? "ใช้งานอยู่" : "ยกเลิก"} · รุ่นพิมพ์ ${receipt.artifactGeneration}`}
          />
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-emerald-50">
              <tr>
                <th className="p-3">รายการ</th>
                <th className="p-3">จำนวน</th>
                <th className="p-3 text-right">ราคาต่อหน่วย</th>
                <th className="p-3 text-right">รวม</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="p-3">
                    <strong>{item.itemName}</strong>
                    {item.description && (
                      <span className="block text-xs text-slate-500">
                        {item.description}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {item.quantity} {item.unit}
                  </td>
                  <td className="p-3 text-right">
                    {formatMoney(item.unitPriceSatang)}
                  </td>
                  <td className="p-3 text-right font-semibold">
                    {formatMoney(item.amountSatang)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="mt-5 ml-auto max-w-md space-y-2 rounded-xl bg-emerald-50 p-4 text-sm">
          <Money label="ค่าที่พัก" value={receipt.lodgingTotalSatang} />
          <Money
            label="ค่าใช้จ่ายเพิ่มเติม"
            value={receipt.extraChargesSatang}
          />
          <Money label="ยอดรวม" value={receipt.totalSatang} strong />
          <Money label="หักมัดจำ" value={receipt.depositSatang} />
          <Money
            label="รับเพิ่ม ณ เช็กเอาต์"
            value={receipt.paidAtCheckoutSatang}
            strong
          />
          {receipt.refundDueSatang > 0 && (
            <Money
              label={receipt.refundRecorded ? "คืนแล้ว" : "ยอดรอคืน"}
              value={receipt.refundDueSatang}
              strong
            />
          )}
        </dl>
      </section>

      {receipt.status === "ISSUED" &&
        receipt.refundDueSatang > 0 &&
        receipt.depositPaymentId && (
          <section className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 sm:p-6">
            <h2 className="text-lg font-bold">การคืนเงิน</h2>
            {receipt.refundRecorded ? (
              <p className="mt-2 font-semibold text-emerald-800">
                ✓ บันทึกคืนเงินเรียบร้อยแล้ว
              </p>
            ) : !receipt.hasDepositSourceAccount && canRecordSource ? (
              <form
                action={recordDepositSourceAction}
                className="mt-4 grid gap-4 sm:grid-cols-2"
              >
                <input type="hidden" name="receiptId" value={receipt.id} />
                <input
                  type="hidden"
                  name="paymentId"
                  value={receipt.depositPaymentId}
                />
                <label className="text-sm font-semibold">
                  ชื่อบัญชีผู้โอนมัดจำ
                  <input
                    name="accountName"
                    className="form-input mt-1.5"
                    required
                  />
                </label>
                <label className="text-sm font-semibold">
                  เลขบัญชี 4 หลักสุดท้าย
                  <input
                    name="accountLast4"
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    className="form-input mt-1.5"
                    required
                  />
                </label>
                <button className="min-h-11 rounded-xl bg-[#123c2f] px-5 font-bold text-white sm:col-span-2 sm:w-fit">
                  บันทึกหลักฐานบัญชีต้นทาง
                </button>
              </form>
            ) : canRefund ? (
              <form
                action={recordRefundAction}
                className="mt-4 grid gap-4 sm:grid-cols-2"
              >
                <input type="hidden" name="receiptId" value={receipt.id} />
                <input
                  type="hidden"
                  name="paymentId"
                  value={receipt.depositPaymentId}
                />
                <p className="text-sm sm:col-span-2">
                  ระบบจะอนุญาตเฉพาะชื่อบัญชีและเลขท้าย 4
                  หลักที่ตรงกับหลักฐานเงินมัดจำ และจัดเก็บเฉพาะเลขบัญชีแบบปกปิด
                </p>
                <label className="text-sm font-semibold">
                  ชื่อบัญชีรับคืน
                  <input
                    name="accountName"
                    className="form-input mt-1.5"
                    required
                  />
                </label>
                <label className="text-sm font-semibold">
                  เลขบัญชีรับคืน
                  <input
                    name="accountNumber"
                    inputMode="numeric"
                    className="form-input mt-1.5"
                    required
                  />
                </label>
                <label className="text-sm font-semibold sm:col-span-2">
                  หมายเหตุ
                  <textarea
                    name="notes"
                    maxLength={1000}
                    className="form-input mt-1.5 min-h-20"
                  />
                </label>
                <button className="min-h-11 rounded-xl bg-[#123c2f] px-5 font-bold text-white sm:col-span-2 sm:w-fit">
                  ยืนยันบันทึกคืน {formatMoney(receipt.refundDueSatang)} บาท
                </button>
              </form>
            ) : (
              <p className="mt-2 text-sm">รอเจ้าของคลินิกดำเนินการคืนเงิน</p>
            )}
          </section>
        )}

      {canManageReceipt && receipt.status === "ISSUED" && (
        <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-bold text-red-800">
            แก้ไขเอกสารโดยไม่เขียนทับ
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            ใบเดิมจะคงอยู่เป็น VOID พร้อมผู้ดำเนินการและเหตุผล
            หากออกใหม่จะใช้เลขลำดับใหม่และคัดลอกจาก snapshot เดิม
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <form
              action={reissueReceiptAction}
              className="rounded-xl border border-amber-200 p-4"
            >
              <input type="hidden" name="receiptId" value={receipt.id} />
              <label className="text-sm font-semibold">
                เหตุผลที่ออกใหม่
                <input
                  name="reason"
                  maxLength={500}
                  className="form-input mt-1.5"
                  required
                />
              </label>
              <button className="mt-3 min-h-11 rounded-xl bg-amber-700 px-4 font-bold text-white">
                ยกเลิกใบเดิมและออกเลขใหม่
              </button>
            </form>
            <form
              action={voidReceiptAction}
              className="rounded-xl border border-red-200 p-4"
            >
              <input type="hidden" name="receiptId" value={receipt.id} />
              <label className="text-sm font-semibold">
                เหตุผลที่ยกเลิก
                <input
                  name="reason"
                  maxLength={500}
                  className="form-input mt-1.5"
                  required
                />
              </label>
              <button className="mt-3 min-h-11 rounded-xl bg-red-700 px-4 font-bold text-white">
                ยกเลิกโดยไม่ออกใหม่
              </button>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}

function Fact({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <dt className="text-xs font-bold text-slate-500 uppercase">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
function Money({
  label,
  value,
  strong = false,
}: {
  readonly label: string;
  readonly value: number;
  readonly strong?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "font-bold" : ""}`}>
      <dt>{label}</dt>
      <dd>{formatMoney(value)} บาท</dd>
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
