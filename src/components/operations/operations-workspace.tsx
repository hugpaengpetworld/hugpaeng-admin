"use client";

import { useMemo, useRef, useState } from "react";

import {
  checkInBookingAction,
  checkOutBookingAction,
} from "@/app/admin/operations/actions";
import { PromptPayQrPanel } from "@/components/finance/promptpay-qr-panel";
import type { OperationalBooking } from "@/data/operations/list-operations";
import { formatDisplayDate } from "@/domain/shared/date";
import { parseCheckoutChargeRows } from "@/features/checkout/parse-charge-rows";

const checkoutLabels = {
  EARLY: "ก่อนกำหนด",
  DUE_TODAY: "ถึงกำหนดวันนี้",
  OVERDUE: "เกินกำหนด (ยังครองห้อง)",
} as const;

const chargeInputs = [
  ["chargeFood", "ค่าอาหาร", "FOOD"],
  ["chargeMedicine", "ค่ายา", "MEDICINE"],
  ["chargeIvFluids", "ให้น้ำเกลือ", "IV_FLUIDS"],
  ["chargeBloodTest", "ตรวจเลือด", "BLOOD_TEST"],
  ["chargeOther", "อื่น ๆ", "OTHER"],
] as const;

export function OperationsWorkspace({
  bookings,
}: {
  readonly bookings: readonly OperationalBooking[];
}) {
  const [species, setSpecies] = useState<"ALL" | "CAT" | "DOG">("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<OperationalBooking | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [chargeValues, setChargeValues] = useState<Record<string, string>>({});
  const [otherDetail, setOtherDetail] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const checkInDialog = useRef<HTMLDialogElement>(null);
  const checkOutDialog = useRef<HTMLDialogElement>(null);

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("th");
    return bookings.filter((booking) => {
      if (species !== "ALL" && booking.species !== species) return false;
      if (!needle) return true;
      return [
        booking.bookingCode,
        booking.customerName,
        booking.customerPhone,
        booking.roomCode,
        ...booking.petLabels,
      ].some((value) => value.toLocaleLowerCase("th").includes(needle));
    });
  }, [bookings, search, species]);

  const waiting = visible.filter(({ status }) => status === "CONFIRMED");
  const active = visible.filter(({ status }) => status === "CHECKED_IN");

  function openCheckIn(booking: OperationalBooking) {
    setSelected(booking);
    setIdempotencyKey(crypto.randomUUID());
    checkInDialog.current?.showModal();
  }

  function openCheckOut(booking: OperationalBooking) {
    setSelected(booking);
    setChargeValues({});
    setOtherDetail("");
    setPaymentMethod("CASH");
    setIdempotencyKey(crypto.randomUUID());
    checkOutDialog.current?.showModal();
  }

  const extraChargesSatang = Object.values(chargeValues).reduce(
    (sum, value) => sum + bahtInputToSatang(value),
    0,
  );
  const checkoutTotalSatang =
    (selected?.groupLodgingTotalSatang ?? 0) +
    (selected?.groupExtraChargesSatang ?? 0) +
    extraChargesSatang;
  const amountDueSatang = Math.max(
    checkoutTotalSatang - (selected?.verifiedDepositSatang ?? 0),
    0,
  );
  const refundDueSatang = Math.max(
    (selected?.verifiedDepositSatang ?? 0) - checkoutTotalSatang,
    0,
  );
  const promptpayCharges = useMemo(() => {
    try {
      return parseCheckoutChargeRows(
        chargeInputs.map(([field, , category]) => ({
          category: chargeValues[field] ? category : "",
          amount: chargeValues[field] ?? "",
          detail: category === "OTHER" ? otherDetail : "",
        })),
      );
    } catch {
      return null;
    }
  }, [chargeValues, otherDetail]);

  return (
    <>
      <section className="grid gap-4 rounded-2xl border border-emerald-900/10 bg-white p-4 shadow-sm sm:grid-cols-[180px_1fr] sm:p-5">
        <label className="text-sm font-semibold">
          ประเภทสัตว์
          <select
            className="form-input mt-1.5"
            value={species}
            onChange={(event) =>
              setSpecies(event.target.value as "ALL" | "CAT" | "DOG")
            }
          >
            <option value="ALL">ทั้งหมด</option>
            <option value="CAT">แมว</option>
            <option value="DOG">สุนัข</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          ค้นหารหัส เจ้าของ สัตว์เลี้ยง ห้อง หรือโทรศัพท์
          <input
            className="form-input mt-1.5"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="พิมพ์คำค้นหา"
          />
        </label>
      </section>

      <OperationalSection
        title="รอเช็กอิน"
        description="รายการยืนยันทั้งหมดที่ยังไม่ได้เปิดการเข้าพัก ไม่จำกัดเฉพาะวันนี้"
        empty="ไม่มีรายการที่รอเช็กอิน"
        bookings={waiting}
        actionLabel="เช็กอิน"
        onAction={openCheckIn}
      />
      <OperationalSection
        title="กำลังเข้าพัก / รอเช็กเอาต์"
        description="แสดง open stay ทุกห้อง รวมรายการเกินกำหนดจนกว่าจะเช็กเอาต์จริง"
        empty="ไม่มีสัตว์เลี้ยงกำลังเข้าพัก"
        bookings={active}
        actionLabel="เช็กเอาต์"
        onAction={openCheckOut}
      />

      <dialog
        ref={checkInDialog}
        className="m-auto w-[min(94vw,640px)] rounded-2xl border-0 p-0 shadow-2xl"
        onClose={() => setSelected(null)}
      >
        {selected && (
          <form action={checkInBookingAction} className="bg-white p-5 sm:p-7">
            <DialogHeading
              title="ยืนยันเช็กอิน"
              subtitle={`${selected.bookingCode} · ${selected.petLabels.join(", ")}`}
              onClose={() => checkInDialog.current?.close()}
            />
            <input type="hidden" name="bookingId" value={selected.id} />
            <input
              type="hidden"
              name="expectedVersion"
              value={selected.version}
            />
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                ห้องพัก
                <select
                  name="roomId"
                  defaultValue={selected.roomId ?? ""}
                  className="form-input mt-1.5"
                  required
                >
                  <option value="" disabled>
                    เลือกห้องที่พร้อมใช้งาน
                  </option>
                  {selected.eligibleRooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                ยอดมัดจำรวมที่รับไว้ (บาท)
                <input
                  name="depositBaht"
                  inputMode="decimal"
                  className="form-input mt-1.5"
                  defaultValue={(selected.verifiedDepositSatang / 100).toFixed(
                    2,
                  )}
                  required
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              ต้องไม่น้อยกว่ายอดที่ตรวจรับแล้ว
              ระบบจะบันทึกเฉพาะส่วนเพิ่มโดยไม่คิดมัดจำซ้ำ
            </p>
            <label className="mt-4 block text-sm font-semibold">
              หมายเหตุเช็กอิน (ไม่บังคับ)
              <textarea
                name="notes"
                maxLength={1500}
                className="form-input mt-1.5 min-h-24"
              />
            </label>
            <DialogActions
              submitLabel="ยืนยันเช็กอินและเปิดการเข้าพัก"
              onCancel={() => checkInDialog.current?.close()}
            />
          </form>
        )}
      </dialog>

      <dialog
        ref={checkOutDialog}
        className="m-auto max-h-[92vh] w-[min(94vw,720px)] overflow-y-auto rounded-2xl border-0 p-0 shadow-2xl"
        onClose={() => setSelected(null)}
      >
        {selected && (
          <form action={checkOutBookingAction} className="bg-white p-5 sm:p-7">
            <DialogHeading
              title="ตรวจยอดและเช็กเอาต์"
              subtitle={`${selected.bookingCode} · ห้อง ${selected.roomCode}`}
              onClose={() => checkOutDialog.current?.close()}
            />
            <input type="hidden" name="bookingId" value={selected.id} />
            <input
              type="hidden"
              name="expectedVersion"
              value={selected.version}
            />
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

            <fieldset className="mt-5 rounded-2xl border border-slate-200 p-4">
              <legend className="px-2 font-bold">
                ค่าใช้จ่ายเพิ่มเติมของห้องนี้ (บาท)
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {chargeInputs.map(([name, label]) => (
                  <label key={name} className="text-sm font-semibold">
                    {label}
                    <input
                      name={name}
                      inputMode="decimal"
                      className="form-input mt-1.5"
                      placeholder="0.00"
                      value={chargeValues[name] ?? ""}
                      onChange={(event) =>
                        setChargeValues((current) => ({
                          ...current,
                          [name]: event.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="mt-3 block text-sm font-semibold">
                รายละเอียด “อื่น ๆ”
                <input
                  name="otherDetail"
                  maxLength={150}
                  className="form-input mt-1.5"
                  value={otherDetail}
                  onChange={(event) => setOtherDetail(event.target.value)}
                />
              </label>
            </fieldset>

            <div className="mt-5 space-y-2 rounded-2xl bg-emerald-50 p-4 text-sm">
              <MoneyRow
                label="ค่าที่พักรวมทั้งกลุ่ม"
                satang={selected.groupLodgingTotalSatang}
              />
              <MoneyRow
                label="ค่าใช้จ่ายสะสมของกลุ่ม"
                satang={selected.groupExtraChargesSatang}
              />
              <MoneyRow
                label="ค่าใช้จ่ายใหม่ของห้องนี้"
                satang={extraChargesSatang}
              />
              <MoneyRow label="ยอดรวม" satang={checkoutTotalSatang} strong />
              <MoneyRow
                label="หักมัดจำ"
                satang={selected.verifiedDepositSatang}
              />
              <MoneyRow
                label="รับเพิ่ม ณ เช็กเอาต์"
                satang={amountDueSatang}
                strong
              />
              {refundDueSatang > 0 && (
                <MoneyRow label="ยอดรอคืน" satang={refundDueSatang} strong />
              )}
            </div>

            {selected.finalGroupCheckout ? (
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
                <input
                  type="hidden"
                  name="paymentMethod"
                  value="NOT_SPECIFIED"
                />
                <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
                  ห้องอื่นใน booking group ยังไม่เช็กเอาต์
                  ระบบจะปล่อยห้องนี้เป็นรอทำความสะอาดก่อน
                  และจะตัดยอดรวมพร้อมออกใบเสร็จเมื่อเช็กเอาต์ห้องสุดท้าย
                </p>
              </>
            )}
            {selected.finalGroupCheckout &&
              paymentMethod === "PROMPTPAY" &&
              amountDueSatang > 0 && (
                <PromptPayQrPanel
                  key={`${selected.id}-${amountDueSatang}`}
                  bookingId={selected.id}
                  expectedVersion={selected.version}
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
            {selected.checkoutTiming === "EARLY" && (
              <label className="mt-4 flex min-h-11 items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
                <input
                  type="checkbox"
                  name="confirmEarlyCheckout"
                  className="mt-1 size-5"
                  required
                />
                ยืนยันเช็กเอาต์ก่อนวันที่วางแผน{" "}
                {formatDisplayDate(selected.plannedCheckOutDate)}
              </label>
            )}
            <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
              เมื่อยืนยัน ห้องจะเปลี่ยนเป็น “รอทำความสะอาด”
              และจะยังไม่เปิดรับรายการใหม่จนกว่าพนักงานจะเปลี่ยนเป็น
              “พร้อมใช้งาน”
            </p>
            <DialogActions
              submitLabel={
                selected.finalGroupCheckout
                  ? "ยืนยันยอดรวมและออกใบเสร็จ"
                  : "เช็กเอาต์ห้องนี้ (ยังไม่ออกใบเสร็จ)"
              }
              onCancel={() => checkOutDialog.current?.close()}
            />
          </form>
        )}
      </dialog>
    </>
  );
}

function OperationalSection({
  title,
  description,
  empty,
  bookings,
  actionLabel,
  onAction,
}: {
  readonly title: string;
  readonly description: string;
  readonly empty: string;
  readonly bookings: readonly OperationalBooking[];
  readonly actionLabel: string;
  readonly onAction: (booking: OperationalBooking) => void;
}) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
        <span className="rounded-full bg-[#dcefe4] px-3 py-1 text-sm font-bold">
          {bookings.length} รายการ
        </span>
      </div>
      {bookings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          {empty}
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => (
            <article
              key={booking.id}
              className="grid gap-4 rounded-2xl border border-emerald-900/10 bg-white p-4 shadow-sm md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-center"
            >
              <div>
                <p className="font-bold">{booking.bookingCode}</p>
                <p className="mt-1 text-sm text-slate-700">
                  {booking.customerName}
                </p>
                <p className="text-xs text-slate-500">
                  {booking.customerPhone}
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {booking.petLabels.join(", ")}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  ห้อง {booking.roomCode} ·{" "}
                  {booking.species === "CAT" ? "แมว" : "สุนัข"}
                </p>
              </div>
              <div className="text-sm">
                <p>
                  {formatDisplayDate(booking.plannedCheckInDate)} →{" "}
                  {formatDisplayDate(booking.plannedCheckOutDate)}
                </p>
                {booking.checkoutTiming && (
                  <p className="mt-1 font-semibold text-amber-800">
                    ◷ {checkoutLabels[booking.checkoutTiming]}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onAction(booking)}
                className="min-h-11 rounded-xl bg-[#123c2f] px-5 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123c2f]"
              >
                {actionLabel}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function DialogHeading({
  title,
  subtitle,
  onClose,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </div>
      <button
        type="button"
        aria-label="ปิด"
        onClick={onClose}
        className="grid size-11 shrink-0 place-items-center rounded-xl border border-slate-300 text-xl"
      >
        ×
      </button>
    </div>
  );
}

function DialogActions({
  submitLabel,
  onCancel,
}: {
  readonly submitLabel: string;
  readonly onCancel: () => void;
}) {
  return (
    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onCancel}
        className="min-h-11 rounded-xl border border-slate-300 px-5 font-bold"
      >
        ยกเลิก
      </button>
      <button className="min-h-11 rounded-xl bg-[#123c2f] px-5 font-bold text-white">
        {submitLabel}
      </button>
    </div>
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
