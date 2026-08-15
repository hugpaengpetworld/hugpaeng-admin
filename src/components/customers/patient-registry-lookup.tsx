"use client";

import { useState } from "react";

import type { RegistrySearchState } from "@/app/admin/customers/actions";
import { SearchHighlight } from "@/components/customers/search-highlight";
import { usePatientRegistrySearch } from "@/components/customers/use-patient-registry-search";

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
  const {
    cleanQuery,
    formRef,
    markSubmitted,
    pending,
    query,
    searchAction,
    setQuery,
    visibleState,
  } = usePatientRegistrySearch();
  const [selectedPetIds, setSelectedPetIds] = useState<readonly string[]>([]);
  const [appliedSelectionKey, setAppliedSelectionKey] = useState("");

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

  function applySelection(
    customer: RegistryCustomer,
    pets: readonly RegistryPet[],
  ): void {
    onSelect({ customer, pets });
    setAppliedSelectionKey(
      `${customer.id}:${pets
        .map(({ id }) => id)
        .sort()
        .join(",")}`,
    );
  }

  return (
    <section className="rounded-2xl border border-emerald-900/10 bg-emerald-50/60 p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-bold">ค้นหาลูกค้าและสัตว์เลี้ยงเดิม</h2>
      <p className="mt-1 text-sm text-slate-600">
        ค้นด้วยเบอร์โทร ชื่อเจ้าของ ชื่อสัตว์ หรือ HN
        เพื่อเลือกข้อมูลเดิมโดยไม่ต้องกรอกซ้ำ
      </p>
      <form
        ref={formRef}
        action={searchAction}
        onSubmit={() => {
          markSubmitted();
          setSelectedPetIds([]);
          setAppliedSelectionKey("");
        }}
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
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedPetIds([]);
              setAppliedSelectionKey("");
            }}
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

      {pending && cleanQuery.length >= 2 && (
        <p className="mt-3 text-sm text-slate-600" aria-live="polite">
          กำลังค้นหา “{cleanQuery}”…
        </p>
      )}
      {visibleState.message && (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
          {visibleState.message}
        </p>
      )}
      {visibleState.status === "success" &&
        visibleState.results.length === 0 && (
          <p className="mt-4 rounded-xl border border-dashed border-emerald-900/20 bg-white p-4 text-sm">
            <strong>ไม่พบข้อมูลที่ตรงกับ “{visibleState.query}”</strong>
            <span className="mt-1 block text-slate-600">
              ตรวจสอบคำค้นอีกครั้ง
              หรือกรอกข้อมูลลูกค้าและสัตว์เลี้ยงใหม่ในแบบฟอร์มด้านล่าง
            </span>
          </p>
        )}

      <div className="mt-4 space-y-3" aria-live="polite">
        {visibleState.results.map((customer) => {
          const selectedPets = customer.pets.filter((pet) =>
            selectedPetIds.includes(pet.id),
          );
          const selectionKey = `${customer.id}:${selectedPets
            .map(({ id }) => id)
            .sort()
            .join(",")}`;
          const isApplied =
            selectedPets.length > 0 && appliedSelectionKey === selectionKey;
          return (
            <article
              key={customer.id}
              className="rounded-xl border border-emerald-900/10 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold">
                    <SearchHighlight
                      text={customer.name}
                      query={visibleState.query}
                    />
                  </h3>
                  <p className="text-sm text-slate-600">
                    โทร{" "}
                    <SearchHighlight
                      text={customer.phone}
                      query={visibleState.query}
                    />
                  </p>
                </div>
                <button
                  type="button"
                  disabled={selectedPets.length === 0}
                  onClick={() => applySelection(customer, selectedPets)}
                  className="min-h-10 rounded-xl bg-[#2d7a5d] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isApplied ? "ใช้ข้อมูลแล้ว ✓" : "ใช้ข้อมูลที่เลือก"}
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
                        <strong>
                          <SearchHighlight
                            text={pet.name}
                            query={visibleState.query}
                          />
                        </strong>
                        <span className="block text-slate-600">
                          <SearchHighlight
                            text={pet.hn}
                            query={visibleState.query}
                          />{" "}
                          · {pet.species === "CAT" ? "แมว" : "สุนัข"}
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
