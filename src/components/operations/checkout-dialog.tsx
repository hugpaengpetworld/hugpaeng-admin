"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { checkOutBookingAction } from "@/app/admin/operations/actions";
import { PromptPayQrPanel } from "@/components/finance/promptpay-qr-panel";
import type { OperationalBooking } from "@/data/operations/list-operations";
import {
  CHARGE_CATEGORIES,
  CHARGE_CATEGORY_LABELS,
  type ChargeCategory,
} from "@/domain/finance/settlement";
import { formatDisplayDate } from "@/domain/shared/date";
import { parseCheckoutChargeRows } from "@/features/checkout/parse-charge-rows";

interface ChargeRow {
  readonly id: number;
  readonly category: ChargeCategory | "";
  readonly amount: string;
  readonly detail: string;
}

export function CheckoutDialog({
  booking,
  returnTo,
  onClose,
}: {
  readonly booking: OperationalBooking | null;
  readonly returnTo: string;
  readonly onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nextChargeId = useRef(2);
  const [chargeRows, setChargeRows] = useState<readonly ChargeRow[]>([
    { id: 1, category: "", amount: "", detail: "" },
  ]);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const idempotencyKey = useMemo(
    () => (booking ? crypto.randomUUID() : ""),
    [booking],
  );

  useEffect(() => {
    if (booking && dialogRef.current && !dialogRef.current.open) {
      setPaymentMethod("CASH");
      dialogRef.current.showModal();
    }
  }, [booking]);

  const promptpayCharges = useMemo(() => {
    try {
      return parseCheckoutChargeRows(
        chargeRows.map((row) => ({
          category: row.category,
          amount: row.amount,
          detail: row.detail,
        })),
      );
    } catch {
      return null;
    }
  }, [chargeRows]);

  const extraChargesSatang = chargeRows.reduce(
    (sum, row) => sum + bahtInputToSatang(row.amount),
    0,
  );
  const checkoutTotalSatang =
    (booking?.groupLodgingTotalSatang ?? 0) +
    (booking?.groupExtraChargesSatang ?? 0) +
    extraChargesSatang;
  const amountDueSatang = Math.max(
    checkoutTotalSatang - (booking?.verifiedDepositSatang ?? 0),
    0,
  );
  const refundDueSatang = Math.max(
    (booking?.verifiedDepositSatang ?? 0) - checkoutTotalSatang,
    0,
  );

  function closeDialog(): void {
    dialogRef.current?.close();
  }

  function updateChargeRow(
    id: number,
    update: Partial<Omit<ChargeRow, "id">>,
  ): void {
    setChargeRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...update } : row)),
    );
  }

  function addChargeRow(): void {
    const id = nextChargeId.current;
    nextChargeId.current += 1;
    setChargeRows((rows) => [
      ...rows,
      { id, category: "", amount: "", detail: "" },
    ]);
  }

  function removeChargeRow(id: number): void {
    setChargeRows((rows) => rows.filter((row) => row.id !== id));
  }

  return (
    <dialog
      ref={dialogRef}
      className="m-auto max-h-[92vh] w-[min(94vw,720px)] overflow-y-auto rounded-2xl border-0 p-0 text-[#173f32] shadow-2xl backdrop:bg-black/55"
      onClose={onClose}
    >
      {booking && (
        <form action={checkOutBookingAction} className="bg-white p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[#2d6a50]">
                เช็กเอาต์จากหน้าห้องพัก
              </p>
              <h2 className="mt-1 text-xl font-bold">ตรวจยอดและเช็กเอาต์</h2>
              <p className="mt-1 text-sm text-slate-600">
                {booking.bookingCode} · ห้อง {booking.roomCode} ·{" "}
                {booking.petLabels.join(", ")}
              </p>
            </div>
            <button
              type="button"
              aria-label="ปิดหน้าตรวจยอดเช็กเอาต์"
              onClick={closeDialog}
              className="grid size-11 shrink-0 place-items-center rounded-xl border border-slate-300 text-xl"
            >
              ×
            </button>
          </div>

          <input type="hidden" name="bookingId" value={booking.id} />
          <input type="hidden" name="expectedVersion" value={booking.version} />
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <input type="hidden" name="returnTo" value={returnTo} />

          <fieldset className="mt-5 rounded-2xl border border-slate-200 p-4">
            <legend className="px-2 font-bold">
              ค่าใช้จ่ายเพิ่มเติมของห้องนี้ (บาท)
            </legend>
            <div className="space-y-4">
              {chargeRows.map((row, index) => (
                <div
                  key={row.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.6fr)_auto] sm:items-end">
                    <label className="text-sm font-semibold">
                      ประเภทรายการ {index + 1}
                      <select
                        name="chargeCategory"
                        className="form-input mt-1.5"
                        value={row.category}
                        onChange={(event) =>
                          updateChargeRow(row.id, {
                            category: event.target.value as ChargeCategory | "",
                            detail:
                              event.target.value === "OTHER" ? row.detail : "",
                          })
                        }
                      >
                        <option value="">เลือกประเภทค่าใช้จ่าย</option>
                        {CHARGE_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {CHARGE_CATEGORY_LABELS[category]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-semibold">
                      จำนวนเงิน (บาท)
                      <input
                        name="chargeAmount"
                        inputMode="decimal"
                        className="form-input mt-1.5"
                        placeholder="0.00"
                        value={row.amount}
                        required={row.category !== ""}
                        onChange={(event) =>
                          updateChargeRow(row.id, {
                            amount: event.target.value,
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => removeChargeRow(row.id)}
                      disabled={chargeRows.length === 1}
                      className="min-h-11 rounded-xl border border-red-200 px-4 text-sm font-bold text-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`ลบรายการค่าใช้จ่าย ${index + 1}`}
                    >
                      ลบ
                    </button>
                  </div>
                  {row.category === "OTHER" ? (
                    <label className="mt-3 block text-sm font-semibold">
                      ระบุว่าเป็นรายการอะไร
                      <input
                        name="chargeDetail"
                        maxLength={150}
                        required
                        className="form-input mt-1.5"
                        value={row.detail}
                        onChange={(event) =>
                          updateChargeRow(row.id, {
                            detail: event.target.value,
                          })
                        }
                      />
                    </label>
                  ) : (
                    <input type="hidden" name="chargeDetail" value="" />
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addChargeRow}
              disabled={chargeRows.length >= 50}
              className="mt-4 min-h-11 rounded-xl border border-[#2d7a5d] px-4 text-sm font-bold text-[#19543f] disabled:opacity-50"
            >
              + เพิ่มรายการ
            </button>
          </fieldset>

          <div className="mt-5 space-y-2 rounded-2xl bg-emerald-50 p-4 text-sm">
            <MoneyRow
              label="ค่าที่พักรวมทั้งกลุ่ม"
              satang={booking.groupLodgingTotalSatang}
            />
            <MoneyRow
              label="ค่าใช้จ่ายสะสมของกลุ่ม"
              satang={booking.groupExtraChargesSatang}
            />
            <MoneyRow
              label="ค่าใช้จ่ายใหม่ของห้องนี้"
              satang={extraChargesSatang}
            />
            <MoneyRow label="ยอดรวม" satang={checkoutTotalSatang} strong />
            <MoneyRow label="หักมัดจำ" satang={booking.verifiedDepositSatang} />
            <MoneyRow
              label="รับเพิ่ม ณ เช็กเอาต์"
              satang={amountDueSatang}
              strong
            />
            {refundDueSatang > 0 && (
              <MoneyRow label="ยอดรอคืน" satang={refundDueSatang} strong />
            )}
          </div>

          {booking.finalGroupCheckout ? (
            <label className="mt-4 block text-sm font-semibold">
              วิธีชำระยอดรวม ณ เช็กเอาต์ห้องสุดท้าย
              <select
                name="paymentMethod"
                className="form-input mt-1.5"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
              >
                <option value="CASH">เงินสด</option>
                <option value="TRANSFER">โอนเงิน</option>
                <option value="PROMPTPAY">พร้อมเพย์</option>
                <option value="CARD">บัตร</option>
                <option value="OTHER">อื่น ๆ</option>
                <option value="NOT_SPECIFIED">ไม่ระบุ</option>
              </select>
            </label>
          ) : (
            <>
              <input type="hidden" name="paymentMethod" value="NOT_SPECIFIED" />
              <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
                ห้องอื่นใน booking group ยังไม่เช็กเอาต์
                ระบบจะปล่อยห้องนี้เป็นรอทำความสะอาดก่อน
                และจะตัดยอดรวมพร้อมออกใบเสร็จเมื่อเช็กเอาต์ห้องสุดท้าย
              </p>
            </>
          )}

          {booking.finalGroupCheckout &&
            paymentMethod === "PROMPTPAY" &&
            amountDueSatang > 0 && (
              <PromptPayQrPanel
                key={`${booking.id}-${amountDueSatang}`}
                bookingId={booking.id}
                expectedVersion={booking.version}
                charges={promptpayCharges}
                displayedAmountDueSatang={amountDueSatang}
              />
            )}

          <label className="mt-4 block text-sm font-semibold">
            หมายเหตุใบเสร็จ / เช็กเอาต์
            <textarea
              name="notes"
              maxLength={1000}
              className="form-input mt-1.5 min-h-24"
            />
          </label>
          {booking.checkoutTiming === "EARLY" && (
            <label className="mt-4 flex min-h-11 items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
              <input
                type="checkbox"
                name="confirmEarlyCheckout"
                className="mt-1 size-5"
                required
              />
              ยืนยันเช็กเอาต์ก่อนวันที่วางแผน{" "}
              {formatDisplayDate(booking.plannedCheckOutDate)}
            </label>
          )}
          <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
            เมื่อยืนยัน ห้องจะเปลี่ยนเป็น “รอทำความสะอาด”
            และจะยังไม่เปิดรับรายการใหม่จนกว่าพนักงานจะเปลี่ยนเป็น “พร้อมใช้งาน”
          </p>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeDialog}
              className="min-h-11 rounded-xl border border-slate-300 px-5 font-bold"
            >
              ยกเลิก
            </button>
            <button className="min-h-11 rounded-xl bg-[#123c2f] px-5 font-bold text-white">
              {booking.finalGroupCheckout
                ? "ยืนยันยอดรวมและออกใบเสร็จ"
                : "เช็กเอาต์ห้องนี้ (ยังไม่ออกใบเสร็จ)"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

function MoneyRow({
  label,
  satang,
  strong = false,
}: {
  readonly label: string;
  readonly satang: number;
  readonly strong?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span>{formatMoney(satang)} บาท</span>
    </div>
  );
}

function formatMoney(satang: number): string {
  return (satang / 100).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function bahtInputToSatang(value: string): number {
  const normalized = value.trim().replaceAll(",", "");
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return 0;
  const [baht, fraction = ""] = normalized.split(".");
  return Number(baht) * 100 + Number(fraction.padEnd(2, "0"));
}
