import Link from "next/link";

import { SterilizationAppointmentForm } from "@/components/sterilization/appointment-form";
import {
  requirePermission,
  requireTenantContext,
} from "@/data/auth/tenant-context";
import {
  listSterilizationAppointments,
  listSterilizationHolidays,
} from "@/data/sterilization/appointments";
import { todayInBangkok } from "@/domain/shared/date";
import { getRegistrySelection } from "@/data/customers/registry";
import {
  sterilizationConsumesCapacity,
  sterilizationErrorMessage,
} from "@/domain/sterilization/rules";

export default async function NewSterilizationAppointmentPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    date?: string;
    error?: string;
    customerId?: string;
    petIds?: string;
  }>;
}) {
  const [query, context] = await Promise.all([
    searchParams,
    requireTenantContext(),
  ]);
  requirePermission(context, "STERILIZATION_WRITE");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query.date ?? "")
    ? query.date!
    : todayInBangkok();
  const [appointments, holidays] = await Promise.all([
    listSterilizationAppointments({ date }),
    listSterilizationHolidays(date.slice(0, 7)),
  ]);
  const activeCount = appointments.filter((item) =>
    sterilizationConsumesCapacity(item.status),
  ).length;
  const holidayReason =
    holidays.find((item) => item.isActive && item.holidayDate === date)
      ?.reason ?? null;
  const selectedPetId = (query.petIds ?? "").split(",")[0];
  const registryCustomer =
    query.customerId &&
    selectedPetId &&
    /^[0-9a-f-]{36}$/i.test(query.customerId) &&
    /^[0-9a-f-]{36}$/i.test(selectedPetId)
      ? await getRegistrySelection(query.customerId, [selectedPetId])
      : null;
  const registryPet = registryCustomer?.pets[0];
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <Link
          href="/admin/sterilization"
          className="text-sm font-bold text-[#2d6a50] underline"
        >
          ← กลับปฏิทิน
        </Link>
        <h1 className="mt-3 text-2xl font-bold sm:text-3xl">รับนัดทำหมัน</h1>
        <p className="mt-2 text-sm text-slate-600">
          สำหรับผู้ใช้งานที่ได้รับสิทธิ์จัดการคิวทำหมัน
        </p>
      </header>
      {query.error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          {sterilizationErrorMessage(query.error)}
        </div>
      )}
      <SterilizationAppointmentForm
        defaultDate={date}
        activeCount={activeCount}
        holidayReason={holidayReason}
        canOverrideHoliday={context.permissions.includes(
          "STERILIZATION_HOLIDAY_MANAGE",
        )}
        registrySelection={
          registryCustomer && registryPet
            ? {
                customerId: registryCustomer.id,
                customerName: registryCustomer.name,
                phone: registryCustomer.phone,
                petId: registryPet.id,
                petName: registryPet.name,
                species: registryPet.species,
                sex: registryPet.sex,
                breed: registryPet.breed,
                weightKg: registryPet.weightKg,
                ageText: registryPet.ageText,
              }
            : undefined
        }
      />
    </div>
  );
}
