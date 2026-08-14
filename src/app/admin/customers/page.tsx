import { RegistryWorkspace } from "@/components/customers/registry-workspace";
import {
  requirePermission,
  requireTenantContext,
} from "@/data/auth/tenant-context";

const errors: Readonly<Record<string, string>> = {
  VALIDATION_ERROR: "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่",
  CUSTOMER_PHONE_EXISTS:
    "พบเบอร์โทรนี้ในทะเบียนแล้ว กรุณาค้นหาลูกค้าเดิมก่อนสร้างรายการใหม่",
  UNKNOWN: "บันทึกทะเบียนไม่สำเร็จ กรุณาลองใหม่",
};

export default async function CustomersPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [context, query] = await Promise.all([
    requireTenantContext(),
    searchParams,
  ]);
  requirePermission(context, "CUSTOMERS_READ");
  requirePermission(context, "PETS_READ");
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-sm font-semibold text-[#2d6a50]">ทะเบียนกลาง</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
          ลูกค้าและสัตว์เลี้ยง
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          สัตว์เลี้ยงแต่ละตัวมี HN ของตนเอง
          และสามารถเลือกสัตว์เดิมหลายตัวเข้ารับบริการในครั้งเดียว
        </p>
      </header>
      {query.success && (
        <div
          role="status"
          className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm"
        >
          บันทึกทะเบียนและออก HN เรียบร้อยแล้ว
        </div>
      )}
      {query.error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          {errors[query.error] ?? errors.UNKNOWN}
        </div>
      )}
      <RegistryWorkspace
        canWriteCustomers={context.permissions.includes("CUSTOMERS_WRITE")}
        canWritePets={context.permissions.includes("PETS_WRITE")}
      />
    </div>
  );
}
