import Link from "next/link";

import { BackOfficeBookingForm } from "@/components/bookings/back-office-booking-form";

const errors: Readonly<Record<string, string>> = {
  VALIDATION_ERROR: "กรุณาตรวจสอบข้อมูลที่กรอกให้ครบและถูกต้อง",
  ROOM_UNAVAILABLE: "มีผู้ใช้เลือกรับห้องนี้ไปแล้ว กรุณาเลือกห้องใหม่",
  ROOM_SPECIES_MISMATCH: "ชนิดสัตว์ไม่ตรงกับห้องที่เลือก",
  INVALID_DOG_WEIGHT: "น้ำหนักสุนัขไม่ผ่านเงื่อนไขของห้องพัก",
  CAPACITY_EXCEEDED: "จำนวนสัตว์หรือห้องเกินความจุที่กำหนด",
  LINE_ID_REQUIRED: "การจองผ่าน LINE ต้องระบุ LINE user ID",
  CUSTOM_NIGHTLY_RATE_INVALID: "ค่าห้องพักต่อคืนไม่ถูกต้อง",
  UNKNOWN: "บันทึกการจองไม่สำเร็จ กรุณาลองใหม่",
};

export default async function NewBookingPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <Link
          href="/admin/bookings"
          className="text-sm font-semibold text-[#2d6a50] hover:underline"
        >
          ← กลับไปรายการจอง
        </Link>
        <h1 className="mt-3 text-2xl font-bold sm:text-3xl">
          สร้างการจองหลังบ้าน
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          กรอกข้อมูลเจ้าของครั้งเดียว
          แล้วแยกสัตว์และห้องพักอย่างชัดเจนในแต่ละห้อง
        </p>
      </header>
      <BackOfficeBookingForm
        errorMessage={
          query.error ? (errors[query.error] ?? errors.UNKNOWN) : undefined
        }
      />
    </div>
  );
}
