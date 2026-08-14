import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintReceiptButton } from "@/components/finance/print-receipt-button";
import { ReceiptPaper } from "@/components/finance/receipt-paper";
import { getReceiptDetail } from "@/data/finance/receipts";

export default async function PrintReceiptPage({
  params,
}: {
  readonly params: Promise<{ receiptId: string }>;
}) {
  const { receiptId } = await params;
  const receipt = await getReceiptDetail(receiptId);
  if (!receipt) notFound();
  return (
    <div className="receipt-print-page">
      <div className="mx-auto mb-5 flex max-w-[80mm] flex-wrap gap-2 print:hidden">
        <Link
          href={`/admin/finance/receipts/${receipt.id}`}
          className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 font-bold"
        >
          ← กลับ
        </Link>
        <PrintReceiptButton />
      </div>
      <ReceiptPaper receipt={receipt} />
    </div>
  );
}
