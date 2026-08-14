"use client";

import { useState } from "react";

import { BOOKING_STATUS_LABELS } from "@/domain/booking/labels";
import type { BookingStatus } from "@/domain/booking/status";
import {
  addDays,
  formatDisplayDate,
  todayInBangkok,
} from "@/domain/shared/date";

interface PublicStatus {
  readonly booking_code: string;
  readonly booking_status: BookingStatus;
  readonly payment_status: string;
  readonly check_in_date: string;
  readonly check_out_date: string;
  readonly lodging_total_satang: number;
  readonly deposit_required_satang: number | null;
  readonly deposit_deadline_at: string | null;
  readonly reschedule_count: number;
  readonly pet_names: string[];
  readonly promptpay_display_value: string | null;
  readonly bank_name: string | null;
  readonly bank_account_name: string | null;
  readonly bank_account_number_masked: string | null;
}

const PAYMENT_STATUS_LABELS: Readonly<Record<string, string>> = {
  NOT_REQUIRED: "ไม่ต้องชำระมัดจำ",
  WAITING: "รอส่งหลักฐานมัดจำ",
  SUBMITTED: "ส่งหลักฐานแล้ว รอตรวจสอบ",
  VERIFIED: "ตรวจสอบมัดจำแล้ว",
  WAIVED: "ยกเว้นมัดจำ",
  EXPIRED: "หมดเวลาชำระ",
  FORFEITED: "ริบมัดจำ",
  REFUND_DUE: "รอดำเนินการคืนเงิน",
  REFUNDED: "คืนเงินแล้ว",
};

export function PublicBookingTools() {
  const today = todayInBangkok();
  const [bookingCode, setBookingCode] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<PublicStatus | null>(null);
  const [newCheckInDate, setNewCheckInDate] = useState(addDays(today, 3));
  const [newCheckOutDate, setNewCheckOutDate] = useState(addDays(today, 4));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function lookupStatus(event: React.FormEvent) {
    event.preventDefault();
    setBusy("status");
    setMessage(null);
    try {
      const response = await fetch("/api/public/booking-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingCode, phone }),
      });
      const body = (await response.json()) as {
        booking?: PublicStatus;
        message?: string;
      };
      if (!response.ok || !body.booking) {
        throw new Error(body.message ?? "ไม่พบรายการจอง");
      }
      setStatus(body.booking);
    } catch (error) {
      setStatus(null);
      setMessage(error instanceof Error ? error.message : "ค้นหาไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function requestReschedule(event: React.FormEvent) {
    event.preventDefault();
    setBusy("reschedule");
    setMessage(null);
    try {
      const response = await fetch("/api/public/reschedule-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bookingCode,
          phone,
          newCheckInDate,
          newCheckOutDate,
          reason,
        }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "ส่งคำขอไม่สำเร็จ");
      setMessage(body.message ?? "รับคำขอเลื่อนวันแล้ว");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ส่งคำขอไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function submitEvidence(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("evidence");
    setMessage(null);
    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/public/deposit-evidence", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "ส่งหลักฐานไม่สำเร็จ");
      setMessage(body.message ?? "ส่งหลักฐานแล้ว");
      event.currentTarget.reset();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ส่งหลักฐานไม่สำเร็จ",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-3xl border border-emerald-900/10 bg-white p-5 shadow-lg sm:p-7">
      <h2 className="text-xl font-black">บริการสำหรับรายการที่ส่งแล้ว</h2>
      {message && (
        <div role="status" className="mt-4 rounded-xl bg-[#dcefe4] p-4 text-sm">
          {message}
        </div>
      )}

      <details className="mt-5 rounded-xl border border-slate-200 p-4" open>
        <summary className="cursor-pointer font-bold">ตรวจสอบสถานะ</summary>
        <form
          onSubmit={lookupStatus}
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          <ToolCredentials
            bookingCode={bookingCode}
            phone={phone}
            onBookingCode={setBookingCode}
            onPhone={setPhone}
          />
          <button
            disabled={busy !== null}
            className="min-h-11 rounded-xl bg-[#123c2f] px-4 font-bold text-white sm:col-span-2"
          >
            {busy === "status" ? "กำลังค้นหา…" : "ตรวจสอบสถานะ"}
          </button>
        </form>
        {status && (
          <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
            <p className="font-bold">{status.booking_code}</p>
            <p className="mt-1">
              {BOOKING_STATUS_LABELS[status.booking_status]}
            </p>
            <p className="mt-2">
              {status.pet_names.join(", ")} ·{" "}
              {formatDisplayDate(status.check_in_date)} →{" "}
              {formatDisplayDate(status.check_out_date)}
            </p>
            <p className="mt-1">
              ค่าที่พัก{" "}
              {(status.lodging_total_satang / 100).toLocaleString("th-TH")} บาท
            </p>
            <p className="mt-1">
              สถานะการชำระ:{" "}
              {PAYMENT_STATUS_LABELS[status.payment_status] ?? "ไม่ทราบสถานะ"}
            </p>
            {status.booking_status === "APPROVED_AWAITING_DEPOSIT" && (
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <p className="font-bold">ข้อมูลชำระมัดจำ</p>
                {status.deposit_required_satang !== null && (
                  <p className="mt-1">
                    ยอดมัดจำ{" "}
                    {(status.deposit_required_satang / 100).toLocaleString(
                      "th-TH",
                    )}{" "}
                    บาท
                  </p>
                )}
                {status.deposit_deadline_at && (
                  <p className="mt-1">
                    ชำระภายใน{" "}
                    {new Intl.DateTimeFormat("th-TH", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Bangkok",
                    }).format(new Date(status.deposit_deadline_at))}
                  </p>
                )}
                {status.promptpay_display_value && (
                  <p className="mt-1">
                    พร้อมเพย์: {status.promptpay_display_value}
                  </p>
                )}
                {status.bank_name && (
                  <p className="mt-1">ธนาคาร: {status.bank_name}</p>
                )}
                {status.bank_account_name && (
                  <p className="mt-1">ชื่อบัญชี: {status.bank_account_name}</p>
                )}
                {status.bank_account_number_masked && (
                  <p className="mt-1">
                    เลขบัญชี: {status.bank_account_number_masked}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </details>

      <details className="mt-3 rounded-xl border border-slate-200 p-4">
        <summary className="cursor-pointer font-bold">
          ขอเลื่อนวันเข้าพัก
        </summary>
        <form
          onSubmit={requestReschedule}
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          <ToolCredentials
            bookingCode={bookingCode}
            phone={phone}
            onBookingCode={setBookingCode}
            onPhone={setPhone}
          />
          <label className="text-sm font-semibold">
            วันเข้าใหม่
            <input
              required
              type="date"
              min={addDays(today, 3)}
              value={newCheckInDate}
              onChange={(event) => setNewCheckInDate(event.target.value)}
              className="form-input mt-1.5"
            />
          </label>
          <label className="text-sm font-semibold">
            วันออกใหม่
            <input
              required
              type="date"
              min={addDays(newCheckInDate, 1)}
              value={newCheckOutDate}
              onChange={(event) => setNewCheckOutDate(event.target.value)}
              className="form-input mt-1.5"
            />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">
            เหตุผล (ไม่บังคับ)
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="form-input mt-1.5 min-h-20"
              maxLength={500}
            />
          </label>
          <button
            disabled={busy !== null}
            className="min-h-11 rounded-xl bg-[#123c2f] px-4 font-bold text-white sm:col-span-2"
          >
            {busy === "reschedule" ? "กำลังส่ง…" : "ส่งคำขอเลื่อนวัน"}
          </button>
        </form>
      </details>

      <details className="mt-3 rounded-xl border border-slate-200 p-4">
        <summary className="cursor-pointer font-bold">
          ส่งหลักฐานมัดจำ LINE
        </summary>
        <form
          onSubmit={submitEvidence}
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          <label className="text-sm font-semibold">
            รหัสการจอง
            <input
              required
              name="bookingCode"
              value={bookingCode}
              onChange={(event) => setBookingCode(event.target.value)}
              className="form-input mt-1.5"
            />
          </label>
          <label className="text-sm font-semibold">
            เบอร์โทรศัพท์
            <input
              required
              name="phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="form-input mt-1.5"
              inputMode="tel"
            />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">
            รูปหรือ PDF ไม่เกิน 10 MB
            <input
              required
              name="evidence"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="form-input mt-1.5"
            />
          </label>
          <button
            disabled={busy !== null}
            className="min-h-11 rounded-xl bg-[#123c2f] px-4 font-bold text-white sm:col-span-2"
          >
            {busy === "evidence" ? "กำลังอัปโหลด…" : "ส่งหลักฐาน"}
          </button>
        </form>
      </details>
    </section>
  );
}

function ToolCredentials({
  bookingCode,
  phone,
  onBookingCode,
  onPhone,
}: {
  readonly bookingCode: string;
  readonly phone: string;
  readonly onBookingCode: (value: string) => void;
  readonly onPhone: (value: string) => void;
}) {
  return (
    <>
      <label className="text-sm font-semibold">
        รหัสการจอง
        <input
          required
          value={bookingCode}
          onChange={(event) => onBookingCode(event.target.value)}
          className="form-input mt-1.5"
        />
      </label>
      <label className="text-sm font-semibold">
        เบอร์โทรศัพท์
        <input
          required
          value={phone}
          onChange={(event) => onPhone(event.target.value)}
          className="form-input mt-1.5"
          inputMode="tel"
        />
      </label>
    </>
  );
}
