import { updateClinicSettingsAction } from "@/app/admin/settings/actions";
import { AdminSettingsNavigation } from "@/components/admin/admin-settings-navigation";
import { ClinicMark } from "@/components/branding/clinic-mark";
import { SubmitSettingsButton } from "@/components/settings/submit-settings-button";
import { Icon } from "@/components/ui/icon";
import {
  requirePermission,
  requireTenantContext,
} from "@/data/auth/tenant-context";
import { getSignedLogoUrl } from "@/data/settings/logo";

const errorMessages: Record<string, string> = {
  invalid_input: "กรุณาตรวจสอบชื่อคลินิก ที่อยู่ และเบอร์โทรศัพท์",
  invalid_logo: "โลโก้ต้องเป็น PNG, JPEG หรือ WebP จริง และมีขนาดไม่เกิน 2 MB",
  upload_failed: "อัปโหลดโลโก้ไม่สำเร็จ กรุณาลองอีกครั้ง",
  save_failed: "บันทึกการตั้งค่าไม่สำเร็จ กรุณาลองอีกครั้ง",
};

export default async function SettingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const context = await requireTenantContext();
  requirePermission(context, "SETTINGS_MANAGE");
  const query = await searchParams;
  const logoUrl = await getSignedLogoUrl(context.logoStoragePath);
  const error = query.error
    ? (errorMessages[query.error] ??
      "บันทึกการตั้งค่าไม่สำเร็จ กรุณาลองอีกครั้ง")
    : null;

  return (
    <div className="min-h-screen bg-[#f5f8f6] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <AdminSettingsNavigation active="settings" />
          <p className="text-sm font-semibold text-[#2d6a50]">
            ผู้มีสิทธิ์ตั้งค่าระบบเท่านั้น
          </p>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold sm:text-3xl">
            <Icon name="settings" className="size-8" />
            การตั้งค่าสำหรับผู้ดูแลระบบ
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            แก้ไขชื่อ ข้อมูลติดต่อ และโลโก้ที่แสดงในระบบ
          </p>
        </header>

        {query.success === "1" && (
          <div
            role="status"
            className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900"
          >
            บันทึกการตั้งค่าเรียบร้อยแล้ว
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          >
            {error}
          </div>
        )}

        <form
          action={updateClinicSettingsAction}
          className="space-y-7 rounded-2xl border border-emerald-900/10 bg-white p-5 shadow-sm sm:p-7"
        >
          <section>
            <h2 className="text-lg font-bold">ชื่อและข้อมูลติดต่อ</h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  htmlFor="thaiName"
                  className="mb-1.5 block text-sm font-semibold"
                >
                  ชื่อคลินิกภาษาไทย <span className="text-red-700">*</span>
                </label>
                <input
                  id="thaiName"
                  name="thaiName"
                  defaultValue={context.thaiName}
                  required
                  maxLength={200}
                  className="min-h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-[#2d6a50] focus:ring-3 focus:ring-[#2d6a50]/15"
                />
              </div>
              <div className="sm:col-span-2">
                <label
                  htmlFor="englishName"
                  className="mb-1.5 block text-sm font-semibold"
                >
                  ชื่อคลินิกภาษาอังกฤษ <span className="text-red-700">*</span>
                </label>
                <input
                  id="englishName"
                  name="englishName"
                  defaultValue={context.englishName}
                  required
                  maxLength={200}
                  className="min-h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-[#2d6a50] focus:ring-3 focus:ring-[#2d6a50]/15"
                />
              </div>
              <div>
                <label
                  htmlFor="contactPhone"
                  className="mb-1.5 block text-sm font-semibold"
                >
                  เบอร์โทรศัพท์{" "}
                  <span className="font-normal text-slate-500">
                    (ไม่บังคับ)
                  </span>
                </label>
                <input
                  id="contactPhone"
                  name="contactPhone"
                  type="tel"
                  inputMode="tel"
                  defaultValue={context.contactPhone ?? ""}
                  placeholder="เช่น 0812345678"
                  className="min-h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-[#2d6a50] focus:ring-3 focus:ring-[#2d6a50]/15"
                />
              </div>
              <div className="sm:col-span-2">
                <label
                  htmlFor="clinicAddress"
                  className="mb-1.5 block text-sm font-semibold"
                >
                  ที่อยู่สำหรับแสดงบนใบเสร็จ{" "}
                  <span className="font-normal text-slate-500">
                    (ไม่บังคับ)
                  </span>
                </label>
                <textarea
                  id="clinicAddress"
                  name="clinicAddress"
                  defaultValue={context.clinicAddress ?? ""}
                  maxLength={500}
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#2d6a50] focus:ring-3 focus:ring-[#2d6a50]/15"
                />
                <p className="mt-1 text-xs text-slate-500">
                  ใบเสร็จจะแสดงเฉพาะที่อยู่นี้และเบอร์โทรศัพท์
                  โดยไม่แสดงข้อมูลภาษี
                </p>
              </div>
            </div>
          </section>

          <section className="border-t border-slate-200 pt-7">
            <h2 className="text-lg font-bold">ข้อมูลภาษีบนใบเสร็จ</h2>
            <p className="mt-1 text-sm text-slate-600">
              ค่าเริ่มต้นจะไม่แสดงส่วนนี้
              เปิดใช้เฉพาะเมื่อต้องการให้ข้อมูลที่กรอกถูกบันทึกลงใบเสร็จ
            </p>
            <label className="mt-4 flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold">
              <input
                type="checkbox"
                name="receiptTaxEnabled"
                defaultChecked={context.receiptTaxEnabled}
                className="size-5 accent-[#123c2f]"
              />
              แสดงข้อมูลภาษีบนใบเสร็จ
            </label>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-semibold sm:col-span-2">
                หัวข้อข้อมูลภาษี
                <input
                  name="receiptTaxHeading"
                  defaultValue={context.receiptTaxHeading ?? "ข้อมูลภาษี"}
                  className="form-input mt-1.5"
                  maxLength={100}
                />
              </label>
              <label className="text-sm font-semibold">
                เลขผู้เสียภาษี
                <input
                  name="taxId"
                  inputMode="numeric"
                  defaultValue={context.taxId ?? ""}
                  className="form-input mt-1.5"
                  maxLength={13}
                  placeholder="ตัวเลข 13 หลัก"
                />
              </label>
              <label className="text-sm font-semibold">
                เลขสาขา / ชื่อสาขา
                <input
                  name="branchNumber"
                  defaultValue={context.branchNumber ?? ""}
                  className="form-input mt-1.5"
                  maxLength={50}
                  placeholder="เช่น สำนักงานใหญ่ หรือ 00000"
                />
              </label>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              เมื่อเปิดใช้ ต้องมีหัวข้อและอย่างน้อยเลขผู้เสียภาษีหรือข้อมูลสาขา
              ใบเสร็จที่ออกแล้วจะเก็บค่าเดิมแบบ immutable snapshot
            </p>
          </section>

          <section className="border-t border-slate-200 pt-7">
            <h2 className="text-lg font-bold">ข้อมูลชำระมัดจำ LINE</h2>
            <p className="mt-1 text-sm text-slate-600">
              แสดงเฉพาะเมื่อลูกค้ายืนยันรหัสการจองและเบอร์โทรศัพท์ที่อยู่ในสถานะรอมัดจำ
            </p>
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
              <h3 className="font-bold">Dynamic PromptPay QR ณ เช็กเอาต์</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                สร้าง QR ใหม่ตามยอดสุทธิของ booking group
                หลังรวมค่าใช้จ่ายและหักมัดจำ
                ใช้เฉพาะก่อนรับชำระที่เช็กเอาต์ห้องสุดท้าย
              </p>
              <label className="mt-3 flex min-h-12 items-center gap-3 rounded-xl border border-emerald-200 bg-white px-4 text-sm font-semibold">
                <input
                  type="checkbox"
                  name="promptpayQrEnabled"
                  defaultChecked={context.promptpayQrEnabled}
                  className="size-5 accent-[#123c2f]"
                />
                เปิดใช้ Dynamic PromptPay QR
              </label>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  ประเภทเลขพร้อมเพย์
                  <select
                    name="promptpayTargetType"
                    defaultValue={context.promptpayTargetType ?? "MOBILE"}
                    className="form-input mt-1.5"
                  >
                    <option value="MOBILE">หมายเลขโทรศัพท์มือถือ</option>
                    <option value="NATIONAL_ID">
                      เลขประชาชน / เลขผู้เสียภาษี
                    </option>
                    <option value="EWALLET">หมายเลข e-Wallet</option>
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  เลขพร้อมเพย์จริงสำหรับสร้าง QR
                  <input
                    name="promptpayTargetValue"
                    inputMode="numeric"
                    autoComplete="off"
                    defaultValue={context.promptpayTargetValue ?? ""}
                    className="form-input mt-1.5"
                    maxLength={20}
                    placeholder="กรอกตัวเลขโดยไม่ต้องใส่ขีด"
                  />
                </label>
                <label className="text-sm font-semibold sm:col-span-2">
                  ชื่อผู้รับเงินที่พนักงานใช้ตรวจสอบ
                  <input
                    name="promptpayPayeeName"
                    defaultValue={context.promptpayPayeeName ?? ""}
                    className="form-input mt-1.5"
                    maxLength={150}
                    placeholder="ชื่อที่ควรปรากฏในแอปธนาคาร"
                  />
                </label>
              </div>
              <p className="mt-3 text-xs leading-5 text-amber-900">
                ข้อมูลนี้ไม่ถูกเขียนลง audit log
                พนักงานต้องตรวจชื่อผู้รับและยอดในแอปธนาคาร
                และยืนยันว่าเงินเข้าจริงก่อนออกใบเสร็จ
              </p>
            </div>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                PromptPay ที่แสดง
                <input
                  name="promptpayDisplayValue"
                  defaultValue={context.promptpayDisplayValue ?? ""}
                  className="form-input mt-1.5"
                  maxLength={100}
                  placeholder="เช่น 081-xxx-xxxx"
                />
              </label>
              <label className="text-sm font-semibold">
                ธนาคาร
                <input
                  name="bankName"
                  defaultValue={context.bankName ?? ""}
                  className="form-input mt-1.5"
                  maxLength={100}
                />
              </label>
              <label className="text-sm font-semibold">
                ชื่อบัญชี
                <input
                  name="bankAccountName"
                  defaultValue={context.bankAccountName ?? ""}
                  className="form-input mt-1.5"
                  maxLength={150}
                />
              </label>
              <label className="text-sm font-semibold">
                เลขบัญชีแบบปิดบัง
                <input
                  name="bankAccountNumberMasked"
                  defaultValue={context.bankAccountNumberMasked ?? ""}
                  className="form-input mt-1.5"
                  maxLength={50}
                  placeholder="xxx-x-x1234-x"
                />
              </label>
            </div>
          </section>

          <section className="border-t border-slate-200 pt-7">
            <h2 className="text-lg font-bold">โลโก้คลินิก</h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-[220px_1fr]">
              <div className="rounded-2xl bg-[#123c2f] p-4">
                <ClinicMark logoUrl={logoUrl} thaiName={context.thaiName} />
              </div>
              <div>
                <label
                  htmlFor="logo"
                  className="mb-1.5 block text-sm font-semibold"
                >
                  อัปโหลดโลโก้ใหม่{" "}
                  <span className="font-normal text-slate-500">
                    (ไม่บังคับ)
                  </span>
                </label>
                <input
                  id="logo"
                  name="logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="block w-full rounded-xl border border-slate-300 bg-white p-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#dcefe4] file:px-3 file:py-2 file:font-semibold file:text-[#123c2f]"
                />
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  PNG, JPEG หรือ WebP ขนาดไม่เกิน 2 MB
                  ระบบตรวจชนิดไฟล์จากเนื้อหา ไม่ใช้เพียงนามสกุล
                </p>
                {context.logoStoragePath && (
                  <label className="mt-4 flex min-h-11 items-center gap-3 rounded-xl bg-slate-50 px-3 text-sm">
                    <input
                      type="checkbox"
                      name="removeLogo"
                      className="size-4 accent-[#123c2f]"
                    />
                    นำโลโก้ปัจจุบันออก
                  </label>
                )}
              </div>
            </div>
          </section>

          <div className="flex justify-end border-t border-slate-200 pt-6">
            <SubmitSettingsButton />
          </div>
        </form>
      </div>
    </div>
  );
}
