"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  addRegistryPetAction,
  createRegistryCustomerAction,
} from "@/app/admin/customers/actions";
import { SearchHighlight } from "@/components/customers/search-highlight";
import { usePatientRegistrySearch } from "@/components/customers/use-patient-registry-search";

interface PetDraft {
  readonly key: string;
  readonly name: string;
  readonly species: "CAT" | "DOG";
  readonly sex: "" | "MALE" | "FEMALE";
  readonly breed: string;
  readonly weightKg: string;
}

const newPet = (): PetDraft => ({
  key: crypto.randomUUID(),
  name: "",
  species: "CAT",
  sex: "",
  breed: "",
  weightKg: "",
});

export function RegistryWorkspace({
  canWriteCustomers,
  canWritePets,
}: {
  readonly canWriteCustomers: boolean;
  readonly canWritePets: boolean;
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
  const [pets, setPets] = useState<readonly PetDraft[]>([newPet()]);
  const petPayload = useMemo(
    () =>
      JSON.stringify(
        pets.map((pet) => ({
          name: pet.name,
          species: pet.species,
          sex: pet.sex || undefined,
          breed: pet.breed || undefined,
          weightKg: pet.weightKg || undefined,
        })),
      ),
    [pets],
  );

  function togglePet(petId: string, checked: boolean) {
    setSelectedPetIds((current) =>
      checked
        ? [...new Set([...current, petId])]
        : current.filter((id) => id !== petId),
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-emerald-900/10 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">ค้นหาลูกค้าเดิม</h2>
        <p className="mt-1 text-sm text-slate-600">
          ค้นด้วยเบอร์โทร ชื่อเจ้าของ ชื่อสัตว์ หรือ HN โดยข้อมูลค้นหาจะส่งแบบ
          POST และไม่ปรากฏใน URL
        </p>
        <form
          ref={formRef}
          action={searchAction}
          onSubmit={markSubmitted}
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
              }}
              className="form-input mt-1.5"
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
      </section>

      {visibleState.status === "success" &&
        visibleState.results.length === 0 && (
          <div className="rounded-2xl border border-dashed border-emerald-900/20 bg-white p-8 text-center">
            <p className="font-bold">
              ไม่พบข้อมูลที่ตรงกับ “{visibleState.query}”
            </p>
            <p className="mt-1 text-sm text-slate-600">
              ตรวจสอบคำค้นอีกครั้ง หรือสร้างลูกค้าและสัตว์เลี้ยงใหม่ด้านล่าง
            </p>
          </div>
        )}

      <section className="space-y-4" aria-live="polite">
        {visibleState.results.map((customer) => {
          const selectedForCustomer = selectedPetIds.filter((id) =>
            customer.pets.some((pet) => pet.id === id),
          );
          const query = new URLSearchParams({
            customerId: customer.id,
            petIds: selectedForCustomer.join(","),
          });
          return (
            <article
              key={customer.id}
              className="rounded-2xl border border-emerald-900/10 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-bold">
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
                  {customer.email && (
                    <p className="text-sm text-slate-600">{customer.email}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/admin/bookings/new?${query}`}
                    aria-disabled={selectedForCustomer.length === 0}
                    className={`min-h-11 rounded-xl px-4 py-2.5 text-sm font-bold ${selectedForCustomer.length ? "bg-[#123c2f] text-white" : "pointer-events-none bg-slate-200 text-slate-500"}`}
                  >
                    จองฝากเลี้ยง
                  </Link>
                  <Link
                    href={`/admin/sterilization/new?${query}`}
                    aria-disabled={selectedForCustomer.length !== 1}
                    className={`min-h-11 rounded-xl border px-4 py-2.5 text-sm font-bold ${selectedForCustomer.length === 1 ? "border-[#123c2f]" : "pointer-events-none border-slate-200 text-slate-400"}`}
                  >
                    นัดทำหมัน
                  </Link>
                </div>
              </div>
              <fieldset className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <legend className="mb-2 font-bold">
                  เลือกสัตว์ที่มารับบริการ
                </legend>
                {customer.pets.map((pet) => (
                  <label
                    key={pet.id}
                    className="flex min-h-20 items-start gap-3 rounded-xl border border-emerald-900/10 bg-[#f5f8f6] p-3"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPetIds.includes(pet.id)}
                      onChange={(event) =>
                        togglePet(pet.id, event.target.checked)
                      }
                      className="mt-1 size-5"
                    />
                    <span>
                      <strong>
                        <SearchHighlight
                          text={pet.name}
                          query={visibleState.query}
                        />
                      </strong>
                      <br />
                      <span className="text-xs text-slate-600">
                        <SearchHighlight
                          text={pet.hn}
                          query={visibleState.query}
                        />{" "}
                        · {pet.species === "CAT" ? "แมว" : "สุนัข"}
                        {pet.breed ? ` · ${pet.breed}` : ""}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {canWritePets && (
                <details className="mt-4 rounded-xl border border-emerald-900/10 p-4">
                  <summary className="cursor-pointer font-bold">
                    + เพิ่มสัตว์เลี้ยงให้เจ้าของรายนี้
                  </summary>
                  <PetFormFields
                    action={addRegistryPetAction}
                    customerId={customer.id}
                  />
                </details>
              )}
            </article>
          );
        })}
      </section>

      {canWriteCustomers && canWritePets && (
        <details className="rounded-2xl border border-emerald-900/10 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer text-lg font-bold">
            + สร้างลูกค้าและสัตว์เลี้ยงใหม่
          </summary>
          <form
            action={createRegistryCustomerAction}
            className="mt-5 space-y-5"
          >
            <input type="hidden" name="pets" value={petPayload} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="fullName" label="ชื่อเจ้าของ" required />
              <Input name="phone" label="เบอร์โทรศัพท์" required type="tel" />
              <Input name="email" label="อีเมล (ไม่บังคับ)" type="email" />
              <Input name="address" label="ที่อยู่ (ไม่บังคับ)" />
            </div>
            <fieldset className="space-y-4">
              <legend className="font-bold">สัตว์เลี้ยง</legend>
              {pets.map((pet, index) => (
                <PetDraftFields
                  key={pet.key}
                  pet={pet}
                  index={index}
                  onChange={(update) =>
                    setPets((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, ...update } : item,
                      ),
                    )
                  }
                  onRemove={
                    pets.length > 1
                      ? () =>
                          setPets((current) =>
                            current.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          )
                      : undefined
                  }
                />
              ))}
              <button
                type="button"
                onClick={() => setPets((current) => [...current, newPet()])}
                className="min-h-11 rounded-xl border border-[#123c2f] px-4 font-bold"
              >
                + เพิ่มสัตว์เลี้ยงอีกตัว
              </button>
            </fieldset>
            <button className="min-h-12 rounded-xl bg-[#123c2f] px-6 font-bold text-white">
              บันทึกทะเบียนลูกค้าและออก HN
            </button>
          </form>
        </details>
      )}
    </div>
  );
}

function PetDraftFields({
  pet,
  index,
  onChange,
  onRemove,
}: {
  readonly pet: PetDraft;
  readonly index: number;
  readonly onChange: (update: Partial<PetDraft>) => void;
  readonly onRemove?: () => void;
}) {
  return (
    <div className="rounded-xl border border-emerald-900/10 p-4">
      <div className="flex items-center justify-between">
        <p className="font-bold">สัตว์ตัวที่ {index + 1}</p>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-sm text-red-700"
          >
            ลบออก
          </button>
        )}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <ControlledInput
          label="ชื่อสัตว์"
          value={pet.name}
          onChange={(name) => onChange({ name })}
          required
        />
        <label className="text-sm font-semibold">
          ชนิดสัตว์
          <select
            value={pet.species}
            onChange={(event) =>
              onChange({ species: event.target.value as "CAT" | "DOG" })
            }
            className="form-input mt-1.5"
          >
            <option value="CAT">แมว</option>
            <option value="DOG">สุนัข</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          เพศ
          <select
            value={pet.sex}
            onChange={(event) =>
              onChange({
                sex: event.target.value as "" | "MALE" | "FEMALE",
              })
            }
            className="form-input mt-1.5"
          >
            <option value="">ไม่ระบุ</option>
            <option value="MALE">ผู้</option>
            <option value="FEMALE">เมีย</option>
          </select>
        </label>
        <ControlledInput
          label="สายพันธุ์"
          value={pet.breed}
          onChange={(breed) => onChange({ breed })}
        />
        <ControlledInput
          label="น้ำหนัก (กก.)"
          value={pet.weightKg}
          onChange={(weightKg) => onChange({ weightKg })}
          type="number"
        />
      </div>
    </div>
  );
}

function PetFormFields({
  action,
  customerId,
}: {
  readonly action: (formData: FormData) => Promise<void>;
  readonly customerId: string;
}) {
  return (
    <form
      action={action}
      className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <input type="hidden" name="customerId" value={customerId} />
      <Input name="name" label="ชื่อสัตว์" required />
      <label className="text-sm font-semibold">
        ชนิดสัตว์
        <select name="species" className="form-input mt-1.5">
          <option value="CAT">แมว</option>
          <option value="DOG">สุนัข</option>
        </select>
      </label>
      <label className="text-sm font-semibold">
        เพศ
        <select name="sex" className="form-input mt-1.5">
          <option value="">ไม่ระบุ</option>
          <option value="MALE">ผู้</option>
          <option value="FEMALE">เมีย</option>
        </select>
      </label>
      <Input name="breed" label="สายพันธุ์" />
      <Input name="weightKg" label="น้ำหนัก (กก.)" type="number" />
      <Input name="dateOfBirth" label="วันเกิด" type="date" />
      <Input name="microchipNumber" label="เลขไมโครชิป" />
      <button className="min-h-11 self-end rounded-xl bg-[#123c2f] px-4 font-bold text-white">
        เพิ่มสัตว์และออก HN
      </button>
    </form>
  );
}

function Input({
  name,
  label,
  type = "text",
  required = false,
}: {
  readonly name: string;
  readonly label: string;
  readonly type?: string;
  readonly required?: boolean;
}) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        className="form-input mt-1.5"
      />
    </label>
  );
}

function ControlledInput({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: string;
  readonly required?: boolean;
}) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <input
        type={type}
        required={required}
        min={type === "number" ? "0.01" : undefined}
        step={type === "number" ? "0.01" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="form-input mt-1.5"
      />
    </label>
  );
}
