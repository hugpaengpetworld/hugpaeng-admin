"use client";

import Image from "next/image";
import { useMemo, useState, useTransition } from "react";

import {
  generatePromptPayQuoteAction,
  type PromptPayQuoteResult,
} from "@/app/admin/operations/promptpay-actions";
import type { ChargeInput } from "@/domain/finance/settlement";

const errorMessages: Readonly<
  Record<Exclude<PromptPayQuoteResult["status"], "READY">, string>
> = {
  INVALID_INPUT: "กรุณาตรวจสอบรายการค่าใช้จ่ายและจำนวนเงิน",
  BOOKING_CHANGED: "ข้อมูลการจองเปลี่ยนแล้ว กรุณาปิดหน้าต่างและเปิดใหม่",
  NOT_FINAL_CHECKOUT: "QR จะแสดงเมื่อเช็กเอาต์ห้องสุดท้ายของกลุ่มเท่านั้น",
  NO_AMOUNT_DUE: "ไม่มียอดที่ต้องรับเพิ่ม จึงไม่ต้องสร้าง QR",
  NOT_CONFIGURED: "ยังไม่ได้เปิดใช้หรือตั้งค่า Dynamic PromptPay QR",
  UNAVAILABLE: "สร้าง QR ไม่สำเร็จ กรุณาลองอีกครั้ง",
};

export function PromptPayQrPanel({
  bookingId,
  expectedVersion,
  charges,
  displayedAmountDueSatang,
}: {
  readonly bookingId: string;
  readonly expectedVersion: number;
  readonly charges: readonly ChargeInput[] | null;
  readonly displayedAmountDueSatang: number;
}) {
  const [quote, setQuote] = useState<{
    readonly fingerprint: string;
    readonly result: PromptPayQuoteResult;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const currentFingerprint = useMemo(
    () =>
      JSON.stringify({
        bookingId,
        expectedVersion,
        charges,
        displayedAmountDueSatang,
      }),
    [bookingId, expectedVersion, charges, displayedAmountDueSatang],
  );
  const activeQuote =
    quote?.fingerprint === currentFingerprint ? quote.result : null;

  function generateQr(): void {
    if (!charges) {
      setQuote({
        fingerprint: currentFingerprint,
        result: { status: "INVALID_INPUT" },
      });
      return;
    }
    startTransition(async () => {
      setQuote({
        fingerprint: currentFingerprint,
        result: await generatePromptPayQuoteAction({
          bookingId,
          expectedVersion,
          charges,
        }),
      });
    });
  }

  return (
    <section className="mt-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-center">
      <h3 className="font-bold">ชำระด้วย Dynamic PromptPay QR</h3>
      <p className="mt-1 text-sm text-slate-700">
        QR จะฝังยอดสุทธิ {formatMoney(displayedAmountDueSatang)} บาท
        และสร้างใหม่สำหรับรายการนี้
      </p>

      {activeQuote?.status === "READY" ? (
        <>
          <div className="mx-auto mt-4 w-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <Image
              src={activeQuote.qrDataUrl}
              width={280}
              height={280}
              unoptimized
              alt={`QR พร้อมเพย์ยอด ${formatMoney(activeQuote.amountDueSatang)} บาท`}
              className="size-[min(70vw,280px)]"
            />
          </div>
          <p className="mt-3 text-2xl font-bold">
            {formatMoney(activeQuote.amountDueSatang)} บาท
          </p>
          <p className="mt-1 text-sm">
            ผู้รับ: <strong>{activeQuote.payeeName}</strong> ·{" "}
            {activeQuote.maskedTarget}
          </p>
          <p className="mt-2 text-xs leading-5 text-amber-900">
            ให้ลูกค้าตรวจชื่อผู้รับและยอดในแอปธนาคารก่อนยืนยันการโอน
          </p>
          <input
            type="hidden"
            name="promptpayQuotedAmountSatang"
            value={activeQuote.amountDueSatang}
          />
          <label className="mt-4 flex min-h-12 items-start gap-3 rounded-xl border border-emerald-300 bg-white p-3 text-left text-sm font-semibold">
            <input
              type="checkbox"
              name="confirmPromptpayReceived"
              required
              className="mt-0.5 size-5 accent-[#123c2f]"
            />
            ตรวจสอบแล้วว่าเงินเข้าบัญชีและยอดตรงกับ QR ก่อนออกใบเสร็จ
          </label>
          <button
            type="button"
            onClick={generateQr}
            disabled={isPending}
            className="mt-3 min-h-11 rounded-xl border border-[#2d7a5d] px-4 text-sm font-bold text-[#19543f] disabled:opacity-50"
          >
            สร้าง QR ใหม่
          </button>
        </>
      ) : (
        <>
          {activeQuote && (
            <p role="alert" className="mt-3 text-sm font-semibold text-red-800">
              {errorMessages[activeQuote.status]}
            </p>
          )}
          <button
            type="button"
            onClick={generateQr}
            disabled={isPending || !charges || displayedAmountDueSatang <= 0}
            className="mt-4 min-h-12 rounded-xl bg-[#123c2f] px-5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "กำลังสร้าง QR…" : "สร้าง QR ตามยอดสุทธิ"}
          </button>
        </>
      )}
    </section>
  );
}

function formatMoney(satang: number): string {
  return (satang / 100).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
