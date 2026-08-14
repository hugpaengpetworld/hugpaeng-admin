import { OperationsWorkspace } from "@/components/operations/operations-workspace";
import { requireTenantContext } from "@/data/auth/tenant-context";
import { listOperationalBookings } from "@/data/operations/list-operations";

const successMessages: Readonly<Record<string, string>> = {
  checked_in: "เช็กอินสำเร็จและเปิดการเข้าพักแล้ว",
  checked_out: "เช็กเอาต์สำเร็จ ห้องเปลี่ยนเป็นรอทำความสะอาดแล้ว",
};

const errorMessages: Readonly<Record<string, string>> = {
  VERSION_CONFLICT: "รายการถูกแก้ไขแล้ว กรุณารีเฟรชและลองใหม่",
  INVALID_STATUS_TRANSITION: "สถานะปัจจุบันไม่อนุญาตให้ดำเนินการนี้",
  ROOM_UNAVAILABLE: "ห้องถูกใช้งานหรือถูกกันไว้แล้ว กรุณาเลือกใหม่",
  ROOM_SPECIES_MISMATCH: "ชนิดห้องไม่ตรงกับสัตว์เลี้ยง",
  ROOM_NOT_READY: "ห้องยังไม่อยู่ในสถานะพร้อมใช้งาน",
  OPEN_STAY_EXISTS: "ห้องนี้มีสัตว์เลี้ยงเข้าพักอยู่",
  DEPOSIT_BELOW_VERIFIED: "ยอดมัดจำรวมต่ำกว่ายอดที่ตรวจรับไว้แล้ว",
  EARLY_CHECKOUT_CONFIRMATION_REQUIRED: "กรุณายืนยันการเช็กเอาต์ก่อนกำหนด",
  PROMPTPAY_PAYMENT_CONFIRMATION_REQUIRED:
    "กรุณาสร้าง QR ตามยอดล่าสุด และยืนยันว่าเงินเข้าบัญชีแล้ว",
  INVALID_CHARGE: "ค่าใช้จ่ายเพิ่มเติมไม่ถูกต้อง",
  INVALID_PAYMENT_METHOD: "วิธีชำระเงินไม่ถูกต้อง",
  IDEMPOTENCY_CONFLICT: "คำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว กรุณาเปิดแบบฟอร์มใหม่",
  CUSTOM_NIGHTLY_RATE_INVALID: "ค่าห้องพักต่อคืนไม่ถูกต้อง",
  LINE_DEPOSIT_REQUIRED: "เช็กอินรายการ LINE ต้องรับมัดจำรวมอย่างน้อย 500 บาท",
  VALIDATION_ERROR: "ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง",
  UNKNOWN: "ดำเนินการไม่สำเร็จ กรุณาลองใหม่",
};

export default async function OperationsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [context, query] = await Promise.all([
    requireTenantContext(),
    searchParams,
  ]);
  const bookings = await listOperationalBookings(context.tenantId);

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm font-bold text-[#2d6a50]">งานหน้าห้องพัก</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
          เช็กอิน–เช็กเอาต์
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          การครองห้องอ้างอิงจากการเข้าพักจริง
          ห้องจะไม่ถูกปล่อยเพียงเพราะเลยวันออกตามแผน
        </p>
      </div>
      {query.success && successMessages[query.success] && (
        <p
          role="status"
          className="mb-5 rounded-xl border border-emerald-300 bg-emerald-50 p-4 font-semibold text-emerald-900"
        >
          ✓ {successMessages[query.success]}
        </p>
      )}
      {query.error && (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-red-300 bg-red-50 p-4 font-semibold text-red-900"
        >
          ! {errorMessages[query.error] ?? errorMessages.UNKNOWN}
        </p>
      )}
      <OperationsWorkspace bookings={bookings} />
    </div>
  );
}
