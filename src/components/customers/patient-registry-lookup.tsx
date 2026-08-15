"use client";

import { useActionState, useState } from "react";

import {
  searchPatientRegistryAction,
  type RegistrySearchState,
} from "@/app/admin/customers/actions";

const initialState: RegistrySearchState = {
  status: "idle",
  results: [],
};

type RegistryCustomer = RegistrySearchState["results"][number];
type RegistryPet = RegistryCustomer["pets"][number];

export interface PatientRegistrySelection {
  readonly customer: RegistryCustomer;
  readonly pets: readonly RegistryPet[];
}

export function PatientRegistryLookup({
  mode,
  onSelect,
}: {
  readonly mode: "BOARDING" | "STERILIZATION";
  readonly onSelect: (selection: PatientRegistrySelection) => void;
}) {
  const [state, searchAction, pending] = useActionState(
    searchPatientRegistryAction,
    initialState,
  );
  const [selectedPetIds, setSelectedPetIds] = useState<readonly string[]>([]);

  function selectPet(
    customerPetIds: readonly string[],
    petId: string,
    checked: boolean,
  ): void {
    setSelectedPetIds((current) => {
      if (mode === "STERILIZATION") return checked ? [petId] : [];
      const sameCustomerSelection = current.filter((id) =>
        customerPetIds.includes(id),
      );
      return checked
        ? [...new Set([...sameCustomerSelection, petId])]
        : sameCustomerSelection.filter((id) => id !== petId);
    });
  }

  return (
    <section className="rounded-2xl border border-emerald-900/10 bg-emerald-50/60 p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-bold">ค้นหาลูกค้าและสัตว์เลี้ยงเดิม</h2>
      <p className="mt-1 text-sm text-slate-600">
        ค้นด้วยเบอร์โทร ชื่อเจ้าของ ชื่อสัตว์ หรือ HN
        เพื่อเลือกข้อมูลเดิมโดยไม่ต้องกรอกซ้ำ
      </p>
      <form
        action={searchAction}
        onSubmit={() => setSelectedPetIds([])}
        className="mt-4 flex flex-col gap-3 sm:flex-row"
      >
        <label className="flex-1 text-sm font-semibold">
          เบอร์โทร / ชื่อ / HN
          <input
            name="query"
            required
            minLength={2}
            maxLength={120}
            autoComplete="off"
            className="form-input mt-1.5 bg-white"
            placeholder="เช่น 092..., สมชาย, ชาไทย หรือ HN-000123"
          />
        </label>
        <button
          disabled={pending}
          className="min-h-11 self-end rounded-xl bg-[#123c2f] px-6 font-bold text-white disabled:opacity-60"
        >
          {pending ? "กำลังค้นหา…" : "ค้นหา"}
        </button>
      </form>

      {state.message && (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
          {state.message}
        </p>
      )}
      {state.status === "success" && state.results.length === 0 && (
        <p className="mt-4 rounded-xl border border-dashed border-emerald-900/20 bg-white p-4 text-sm">
          ไม่พบข้อมูลเดิม
          สามารถกรอกข้อมูลลูกค้าและสัตว์เลี้ยงใหม่ในแบบฟอร์มด้านล่าง
        </p>
      )}

      <div className="mt-4 space-y-3" aria-live="polite">
        {state.results.map((customer) => {
          const selectedPets = customer.pets.filter((pet) =>
            selectedPetIds.includes(pet.id),
          );
          return (
            <article
              key={customer.id}
              className="rounded-xl border border-emerald-900/10 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold">{customer.name}</h3>
                  <p className="text-sm text-slate-600">โทร {customer.phone}</p>
                </div>
                <button
                  type="button"
                  disabled={selectedPets.length === 0}
                  onClick={() => onSelect({ customer, pets: selectedPets })}
                  className="min-h-10 rounded-xl bg-[#2d7a5d] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  ใช้ข้อมูลที่เลือก
                </button>
              </div>
              {customer.pets.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">
                  ลูกค้ารายนี้ยังไม่มีสัตว์เลี้ยงที่ใช้งานอยู่
                </p>
              ) : (
                <fieldset className="mt-3 grid gap-2 sm:grid-cols-2">
                  <legend className="mb-1 text-sm font-bold">
                    {mode === "STERILIZATION"
                      ? "เลือกสัตว์ 1 ตัว"
                      : "เลือกสัตว์ได้หลายตัว"}
                  </legend>
                  {customer.pets.map((pet) => (
                    <label
                      key={pet.id}
                      className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 hover:bg-emerald-50"
                    >
                      <input
                        type={mode === "STERILIZATION" ? "radio" : "checkbox"}
                        name={
                          mode === "STERILIZATION"
                            ? "registrySterilizationPet"
                            : undefined
                        }
                        checked={selectedPetIds.includes(pet.id)}
                        onChange={(event) =>
                          selectPet(
                            customer.pets.map(({ id }) => id),
                            pet.id,
                            event.target.checked,
                          )
                        }
                        className="mt-0.5 size-5"
                      />
                      <span className="text-sm">
                        <strong>{pet.name}</strong>
                        <span className="block text-slate-600">
                          {pet.hn} · {pet.species === "CAT" ? "แมว" : "สุนัข"}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
