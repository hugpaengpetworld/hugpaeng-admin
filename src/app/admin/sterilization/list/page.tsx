import Link from "next/link";

import { updateSterilizationStatusAction } from "@/app/admin/sterilization/actions";
import { listSterilizationAppointments } from "@/data/sterilization/appointments";
import { formatDisplayDate } from "@/domain/shared/date";
import {
  nextSterilizationStatuses,
  STERILIZATION_STATUS_LABELS,
  sterilizationErrorMessage,
  sterilizationStatusSchema,
} from "@/domain/sterilization/rules";

export default async function SterilizationListPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    q?: string;
    date?: string;
    status?: string;
    success?: string;
    error?: string;
  }>;
}) {
  const query = await searchParams;
  const statusResult = sterilizationStatusSchema.safeParse(query.status);
  const appointments = await listSterilizationAppointments({
    date: /^\d{4}-\d{2}-\d{2}$/.test(query.date ?? "") ? query.date : undefined,
    status: statusResult.success ? statusResult.data : undefined,
  });
  const search = query.q?.trim().toLocaleLowerCase("th") ?? "";
  const visible = appointments.filter(
    (item) =>
      !search ||
      [item.appointmentCode, item.customerName, item.phone, item.petName].some(
        (value) => value.toLocaleLowerCase("th").includes(search),
      ),
  );
  const returnQuery = new URLSearchParams();
  if (query.q) returnQuery.set("q", query.q);
  if (query.date) returnQuery.set("date", query.date);
  if (query.status) returnQuery.set("status", query.status);
  const returnPath = `/admin/sterilization/list${returnQuery.size ? `?${returnQuery}` : ""}`;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/admin/sterilization"
            className="text-sm font-bold text-[#2d6a50] underline"
          >
            ← ปฏิทินคิวทำหมัน
          </Link>
          <h1 className="mt-3 text-2xl font-bold sm:text-3xl">
            รายการนัดทำหมัน
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            ค้นหา เปิดรายละเอียด และเปลี่ยนสถานะตามลำดับงานที่อนุญาต
          </p>
        </div>
        <Link
          href="/admin/sterilization/new"
          className="inline-flex min-h-11 items-center rounded-xl bg-[#123c2f] px-4 font-bold text-white"
        >
          + รับนัดทำหมัน
        </Link>
      </header>
      {query.success && (
        <div
          role="status"
          className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm"
        >
          บันทึกสถานะเรียบร้อยแล้ว
        </div>
      )}
      {query.error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          {sterilizationErrorMessage(query.error)}
        </div>
      )}
      <form
        method="get"
        className="grid gap-3 rounded-2xl border border-emerald-900/10 bg-white p-4 sm:grid-cols-4"
      >
        <label className="text-sm font-semibold sm:col-span-2">
          ค้นหารหัส เจ้าของ โทรศัพท์ หรือชื่อสัตว์
          <input
            name="q"
            defaultValue={query.q}
            className="form-input mt-1.5"
          />
        </label>
        <label className="text-sm font-semibold">
          วันที่นัด
          <input
            name="date"
            type="date"
            defaultValue={query.date}
            className="form-input mt-1.5"
          />
        </label>
        <label className="text-sm font-semibold">
          สถานะ
          <select
            name="status"
            defaultValue={query.status ?? ""}
            className="form-input mt-1.5"
          >
            <option value="">ทั้งหมด</option>
            {Object.entries(STERILIZATION_STATUS_LABELS).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ),
            )}
          </select>
        </label>
        <button className="min-h-11 rounded-xl bg-[#123c2f] px-4 font-bold text-white sm:col-start-4">
          กรองรายการ
        </button>
      </form>
      {visible.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="font-bold">ไม่พบรายการนัด</h2>
          <p className="mt-2 text-sm text-slate-600">
            ลองเปลี่ยนตัวกรอง หรือสร้างนัดใหม่จากปุ่มด้านบน
          </p>
        </section>
      ) : (
        <div className="space-y-3">
          {visible.map((item) => {
            const nextStatuses = nextSterilizationStatuses(item.status);
            const speciesLabel =
              item.species === "CAT"
                ? "แมว"
                : item.species === "DOG"
                  ? "สุนัข"
                  : (item.customSpecies ?? "สัตว์อื่น");
            return (
              <details
                id={`appointment-${item.id}`}
                key={item.id}
                className="rounded-2xl border border-emerald-900/10 bg-white p-5 shadow-sm open:border-[#2d6a50]/40"
              >
                <summary className="flex cursor-pointer list-none flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-bold">
                      {item.appointmentCode} · {item.petName}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatDisplayDate(item.appointmentDate)}{" "}
                      {item.appointmentTime} · {item.customerName} ·{" "}
                      {item.phone}
                    </p>
                  </div>
                  <span className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold">
                    {STERILIZATION_STATUS_LABELS[item.status]}
                  </span>
                </summary>
                <div className="mt-5 grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2 lg:grid-cols-4">
                  <Detail
                    label="สัตว์"
                    value={`${speciesLabel} · ${item.sex === "MALE" ? "ผู้" : "เมีย"}`}
                  />
                  <Detail label="อายุ" value={item.ageText ?? "ไม่ระบุ"} />
                  <Detail
                    label="วัคซีน"
                    value={item.vaccinationStatus ?? "ไม่ระบุ"}
                  />
                  <Detail
                    label="สายพันธุ์/น้ำหนัก"
                    value={
                      [
                        item.breed,
                        item.weightKg ? `${item.weightKg} กก.` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "ไม่ระบุ"
                    }
                  />
                  {item.notes && (
                    <div className="sm:col-span-2 lg:col-span-4">
                      <p className="text-xs font-semibold text-slate-500">
                        หมายเหตุ
                      </p>
                      <p className="mt-1 text-sm">{item.notes}</p>
                    </div>
                  )}
                </div>
                {nextStatuses.length > 0 && (
                  <form
                    action={updateSterilizationStatusAction}
                    className="mt-5 flex flex-wrap items-end gap-3"
                  >
                    <input type="hidden" name="appointmentId" value={item.id} />
                    <input type="hidden" name="returnPath" value={returnPath} />
                    <label className="text-sm font-semibold">
                      เปลี่ยนสถานะ
                      <select
                        name="status"
                        required
                        className="form-input mt-1.5"
                      >
                        {nextStatuses.map((status) => (
                          <option key={status} value={status}>
                            {STERILIZATION_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="min-h-11 rounded-xl bg-[#123c2f] px-4 font-bold text-white">
                      บันทึกสถานะ
                    </button>
                  </form>
                )}
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
