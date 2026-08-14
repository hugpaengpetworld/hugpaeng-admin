"use client";

import { useState } from "react";

import { createSterilizationAppointmentAction } from "@/app/admin/sterilization/actions";

export function SterilizationAppointmentForm({
  defaultDate,
  activeCount,
  holidayReason,
  canOverrideHoliday,
}: {
  readonly defaultDate: string;
  readonly activeCount: number;
  readonly holidayReason: string | null;
  readonly canOverrideHoliday: boolean;
}) {
  const [species, setSpecies] = useState("CAT");
  const overCapacity = activeCount >= 4;
  return (
    <form action={createSterilizationAppointmentAction} className="space-y-6">
      {(overCapacity || holidayReason) && (
        <div
          role="alert"
          className="rounded-xl border border-purple-300 bg-purple-50 p-4 text-sm text-purple-950"
        >
          <p className="font-bold">ต้องยืนยันข้อยกเว้นก่อนบันทึก</p>
          {overCapacity && (
            <p className="mt-1">
              วันที่เลือกมีคิวที่นับความจุแล้ว {activeCount} ตัว
              การเพิ่มรายการนี้เป็นการ overbook
            </p>
          )}
          {holidayReason && (
            <p className="mt-1">วันนี้เป็นวันหยุดทำหมัน: {holidayReason}</p>
          )}
        </div>
      )}

      <fieldset className="grid gap-4 rounded-2xl border border-emerald-900/10 bg-white p-5 sm:grid-cols-2">
        <legend className="px-2 font-bold">วันและช่องทางนัด</legend>
        <label className="text-sm font-semibold">
          วันที่นัด
          <input
            name="appointmentDate"
            type="date"
            required
            defaultValue={defaultDate}
            className="form-input mt-1.5"
          />
        </label>
        <label className="text-sm font-semibold">
          เวลานัด
          <input
            name="appointmentTime"
            type="time"
            required
            defaultValue="09:00"
            className="form-input mt-1.5"
          />
        </label>
        <label className="text-sm font-semibold">
          ช่องทางรับนัด
          <select
            name="sourceChannel"
            defaultValue="PHONE"
            className="form-input mt-1.5"
          >
            <option value="PHONE">โทรศัพท์</option>
            <option value="WALK_IN">Walk-in</option>
            <option value="FACEBOOK">Facebook</option>
            <option value="OTHER">อื่น ๆ</option>
          </select>
        </label>
      </fieldset>

      <fieldset className="grid gap-4 rounded-2xl border border-emerald-900/10 bg-white p-5 sm:grid-cols-2">
        <legend className="px-2 font-bold">เจ้าของและสัตว์</legend>
        <label className="text-sm font-semibold">
          ชื่อเจ้าของ
          <input
            name="customerName"
            required
            maxLength={120}
            className="form-input mt-1.5"
          />
        </label>
        <label className="text-sm font-semibold">
          เบอร์โทรศัพท์
          <input
            name="phone"
            type="tel"
            required
            maxLength={20}
            className="form-input mt-1.5"
          />
        </label>
        <label className="text-sm font-semibold">
          ชื่อสัตว์
          <input
            name="petName"
            required
            maxLength={100}
            className="form-input mt-1.5"
          />
        </label>
        <label className="text-sm font-semibold">
          ชนิดสัตว์
          <select
            name="species"
            value={species}
            onChange={(event) => setSpecies(event.target.value)}
            className="form-input mt-1.5"
          >
            <option value="CAT">แมว</option>
            <option value="DOG">สุนัข</option>
            <option value="OTHER">อื่น ๆ</option>
          </select>
        </label>
        {species === "OTHER" && (
          <label className="text-sm font-semibold sm:col-span-2">
            ระบุชนิดสัตว์
            <input
              name="customSpecies"
              required
              autoFocus
              maxLength={50}
              className="form-input mt-1.5"
            />
          </label>
        )}
        <label className="text-sm font-semibold">
          เพศ
          <select
            name="sex"
            required
            defaultValue=""
            className="form-input mt-1.5"
          >
            <option value="" disabled>
              เลือกเพศ
            </option>
            <option value="MALE">ผู้</option>
            <option value="FEMALE">เมีย</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          สายพันธุ์ (ไม่บังคับ)
          <input name="breed" maxLength={100} className="form-input mt-1.5" />
        </label>
        <label className="text-sm font-semibold">
          น้ำหนัก กก. (ไม่บังคับ)
          <input
            name="weightKg"
            type="number"
            min="0.01"
            max="999.99"
            step="0.01"
            className="form-input mt-1.5"
          />
        </label>
        <label className="text-sm font-semibold">
          อายุสัตว์
          <input
            name="ageText"
            maxLength={60}
            placeholder="เช่น 8 เดือน หรือ 2 ปี"
            className="form-input mt-1.5"
          />
        </label>
        <label className="text-sm font-semibold sm:col-span-2">
          สถานะวัคซีน
          <input
            name="vaccinationStatus"
            maxLength={200}
            placeholder="เช่น ครบตามกำหนด หรือยังไม่ครบ"
            className="form-input mt-1.5"
          />
        </label>
        <label className="text-sm font-semibold sm:col-span-2">
          หมายเหตุ
          <textarea
            name="notes"
            maxLength={1000}
            rows={3}
            className="form-input mt-1.5"
          />
        </label>
      </fieldset>

      {(overCapacity || holidayReason) && (
        <fieldset className="space-y-3 rounded-2xl border border-purple-300 bg-white p-5">
          <legend className="px-2 font-bold">การยืนยันข้อยกเว้น</legend>
          {overCapacity && (
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <input
                name="acknowledgeOverbook"
                type="checkbox"
                required
                className="mt-1 size-5"
              />
              <span>
                <strong>ยืนยันรับคิวเกิน 4 ตัว</strong>
                <br />
                ระบบจะบันทึกผู้ยืนยันและจำนวนคิวเดิมใน Audit Log
              </span>
            </label>
          )}
          {holidayReason && canOverrideHoliday && (
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <input
                name="holidayOverride"
                type="checkbox"
                required
                className="mt-1 size-5"
              />
              <span>
                <strong>ยืนยันรับนัดในวันหยุด</strong>
                <br />
                สิทธิ์นี้ใช้ได้เฉพาะเจ้าของหรือสัตวแพทย์และถูกบันทึกใน Audit Log
              </span>
            </label>
          )}
          {holidayReason && !canOverrideHoliday && (
            <p role="alert" className="text-sm font-semibold text-red-700">
              บัญชีพนักงานไม่มีสิทธิ์ยกเว้นวันหยุด
              กรุณาให้เจ้าของหรือสัตวแพทย์เป็นผู้บันทึก
            </p>
          )}
        </fieldset>
      )}

      <button
        disabled={Boolean(holidayReason && !canOverrideHoliday)}
        className="min-h-12 rounded-xl bg-[#123c2f] px-6 font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        บันทึกนัดทำหมัน
      </button>
    </form>
  );
}
