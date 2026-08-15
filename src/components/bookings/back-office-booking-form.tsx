"use client";

import { useEffect, useMemo, useState } from "react";

import { createBackOfficeBookingAction } from "@/app/admin/bookings/actions";
import { BookingSubmitButton } from "@/components/bookings/booking-submit-button";
import {
  PatientRegistryLookup,
  type PatientRegistrySelection,
} from "@/components/customers/patient-registry-lookup";
import { parseBahtToSatang } from "@/domain/finance/settlement";
import { addDays, todayInBangkok } from "@/domain/shared/date";

type Species = "CAT" | "DOG";

interface RoomOption {
  readonly room_id: string;
  readonly room_code: string;
}

interface PetDraft {
  readonly petId?: string;
  readonly name: string;
  readonly weightKg: string;
  readonly fleaTickTreated?: boolean;
  readonly fleaTickProduct: string;
  readonly fleaTickTreatedOn: string;
}

interface UnitDraft {
  readonly key: string;
  readonly species: Species;
  readonly roomId: string;
  readonly nightlyRateBaht: string;
  readonly notes: string;
  readonly pets: readonly PetDraft[];
}

interface BookingRegistryCustomer {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly pets: readonly {
    readonly id: string;
    readonly name: string;
    readonly species: Species;
    readonly weightKg: number | null;
  }[];
}

const newPet = (preset?: Partial<PetDraft>): PetDraft => ({
  name: "",
  weightKg: "",
  fleaTickProduct: "",
  fleaTickTreatedOn: "",
  ...preset,
});

const newUnit = (species: Species = "CAT", roomId = ""): UnitDraft => ({
  key: crypto.randomUUID(),
  species,
  roomId,
  nightlyRateBaht: "150.00",
  notes: "",
  pets: [newPet()],
});

function buildRegistryUnits(
  customer: BookingRegistryCustomer,
  defaultSpecies: Species,
  defaultRoomId: string,
): readonly UnitDraft[] {
  const grouped: UnitDraft[] = [];
  const speciesOrder: readonly Species[] = [
    defaultSpecies,
    defaultSpecies === "CAT" ? "DOG" : "CAT",
  ];
  for (const species of speciesOrder) {
    const speciesPets = customer.pets.filter((pet) => pet.species === species);
    for (let index = 0; index < speciesPets.length; index += 2) {
      const unit = newUnit(
        species,
        species === defaultSpecies && grouped.length === 0 ? defaultRoomId : "",
      );
      grouped.push({
        ...unit,
        pets: speciesPets.slice(index, index + 2).map((pet) =>
          newPet({
            petId: pet.id,
            name: pet.name,
            weightKg: pet.weightKg?.toString() ?? "",
          }),
        ),
      });
    }
  }
  return grouped.length > 0
    ? grouped
    : [newUnit(defaultSpecies, defaultRoomId)];
}

const channels = [
  ["PHONE", "โทรศัพท์"],
  ["WALK_IN", "หน้าคลินิก"],
  ["LINE", "LINE"],
  ["FACEBOOK", "Facebook"],
  ["WEBSITE", "เว็บไซต์"],
  ["OTHER", "ช่องทางอื่น"],
] as const;

export function BackOfficeBookingForm({
  errorMessage,
  defaultCheckInDate,
  defaultSpecies = "CAT",
  defaultRoomId = "",
  allowDirectCheckIn = false,
  registryCustomer,
}: {
  readonly errorMessage?: string;
  readonly defaultCheckInDate?: string;
  readonly defaultSpecies?: Species;
  readonly defaultRoomId?: string;
  readonly allowDirectCheckIn?: boolean;
  readonly registryCustomer?: BookingRegistryCustomer;
}) {
  const today = useMemo(() => todayInBangkok(), []);
  const initialCheckInDate = defaultCheckInDate ?? today;
  const [checkInDate, setCheckInDate] = useState(initialCheckInDate);
  const [checkOutDate, setCheckOutDate] = useState(
    addDays(initialCheckInDate, 1),
  );
  const [customerName, setCustomerName] = useState(
    registryCustomer?.name ?? "",
  );
  const [customerPhone, setCustomerPhone] = useState(
    registryCustomer?.phone ?? "",
  );
  const [activeRegistryCustomer, setActiveRegistryCustomer] = useState<
    BookingRegistryCustomer | undefined
  >(registryCustomer);
  const [customerNotes, setCustomerNotes] = useState("");
  const [channel, setChannel] = useState<(typeof channels)[number][0]>("PHONE");
  const [lineUserId, setLineUserId] = useState("");
  const [depositBaht, setDepositBaht] = useState("0.00");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [units, setUnits] = useState<readonly UnitDraft[]>(() => {
    return registryCustomer
      ? buildRegistryUnits(registryCustomer, defaultSpecies, defaultRoomId)
      : [newUnit(defaultSpecies, defaultRoomId)];
  });
  const [rooms, setRooms] = useState<Record<Species, readonly RoomOption[]>>({
    CAT: [],
    DOG: [],
  });
  const [roomState, setRoomState] = useState<"idle" | "loading" | "error">(
    "idle",
  );

  useEffect(() => {
    if (!checkInDate || !checkOutDate || checkInDate >= checkOutDate) return;
    const controller = new AbortController();
    Promise.all(
      (["CAT", "DOG"] as const).map(async (species) => {
        const query = new URLSearchParams({
          species,
          checkInDate,
          checkOutDate,
        });
        const response = await fetch(`/api/admin/eligible-rooms?${query}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("ROOM_LOOKUP_FAILED");
        const body = (await response.json()) as { rooms: RoomOption[] };
        return [species, body.rooms] as const;
      }),
    )
      .then((entries) => {
        setRooms(Object.fromEntries(entries) as Record<Species, RoomOption[]>);
        setRoomState("idle");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setRoomState("error");
      });
    return () => controller.abort();
  }, [checkInDate, checkOutDate]);

  const selectedRoomIds = new Set(units.map(({ roomId }) => roomId));
  const payload = JSON.stringify({
    customerId: activeRegistryCustomer?.id,
    customerName,
    customerPhone,
    customerNotes,
    channel,
    lineUserId: channel === "LINE" ? lineUserId : undefined,
    depositSatang: safelyParseBaht(depositBaht),
    idempotencyKey,
    checkInDate,
    checkOutDate,
    units: units.map((unit) => ({
      species: unit.species,
      roomId: unit.roomId,
      nightlyRateSatang: safelyParseBaht(unit.nightlyRateBaht),
      notes: unit.notes,
      pets: unit.pets.map((pet) => ({
        ...pet,
        weightKg: pet.weightKg,
        fleaTickTreated:
          pet.fleaTickTreated === undefined ? undefined : pet.fleaTickTreated,
      })),
    })),
  });

  function updateUnit(index: number, update: Partial<UnitDraft>) {
    setUnits((current) =>
      current.map((unit, unitIndex) =>
        unitIndex === index ? { ...unit, ...update } : unit,
      ),
    );
  }

  function updatePet(
    unitIndex: number,
    petIndex: number,
    update: Partial<PetDraft>,
  ) {
    const unit = units[unitIndex];
    if (!unit) return;
    updateUnit(unitIndex, {
      pets: unit.pets.map((pet, index) =>
        index === petIndex ? { ...pet, ...update } : pet,
      ),
    });
  }

  function applyRegistrySelection(selection: PatientRegistrySelection): void {
    const customer: BookingRegistryCustomer = {
      id: selection.customer.id,
      name: selection.customer.name,
      phone: selection.customer.phone,
      pets: selection.pets.map((pet) => ({
        id: pet.id,
        name: pet.name,
        species: pet.species,
        weightKg: pet.weightKg,
      })),
    };
    setActiveRegistryCustomer(customer);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone);
    setUnits(buildRegistryUnits(customer, defaultSpecies, defaultRoomId));
  }

  function clearRegistrySelection(): void {
    setActiveRegistryCustomer(undefined);
    setCustomerName("");
    setCustomerPhone("");
    setUnits([newUnit(defaultSpecies, defaultRoomId)]);
  }

  return (
    <div className="space-y-6">
      <PatientRegistryLookup
        mode="BOARDING"
        onSelect={applyRegistrySelection}
      />
      <form action={createBackOfficeBookingAction} className="space-y-6">
        <input type="hidden" name="payload" value={payload} />
        {errorMessage && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          >
            {errorMessage}
          </div>
        )}

        <section className="rounded-2xl border border-emerald-900/10 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-bold">ข้อมูลเจ้าของและช่วงเข้าพัก</h2>
          {activeRegistryCustomer && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <p>
                ใช้ทะเบียนของ <strong>{activeRegistryCustomer.name}</strong> ·
                สัตว์ที่เลือก {activeRegistryCustomer.pets.length} ตัว
              </p>
              <button
                type="button"
                onClick={clearRegistrySelection}
                className="min-h-10 rounded-lg border border-emerald-800 px-3 font-semibold"
              >
                เปลี่ยนเป็นลูกค้าใหม่
              </button>
            </div>
          )}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="ชื่อเจ้าของ" required>
              <input
                required
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                readOnly={Boolean(activeRegistryCustomer)}
                className="form-input"
                autoComplete="name"
              />
            </Field>
            <Field label="เบอร์โทรศัพท์" required>
              <input
                required
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                readOnly={Boolean(activeRegistryCustomer)}
                className="form-input"
                inputMode="tel"
                autoComplete="tel"
              />
            </Field>
            <Field label="วันเข้าพัก" required>
              <input
                required
                type="date"
                value={checkInDate}
                onChange={(event) => {
                  setCheckInDate(event.target.value);
                  setRoomState("loading");
                }}
                className="form-input"
              />
            </Field>
            <Field label="วันออก" required>
              <input
                required
                type="date"
                min={addDays(checkInDate, 1)}
                value={checkOutDate}
                onChange={(event) => {
                  setCheckOutDate(event.target.value);
                  setRoomState("loading");
                }}
                className="form-input"
              />
            </Field>
            <Field label="ช่องทางการจอง" required>
              <select
                value={channel}
                onChange={(event) => {
                  const nextChannel = event.target.value as typeof channel;
                  setChannel(nextChannel);
                  if (
                    allowDirectCheckIn &&
                    nextChannel === "LINE" &&
                    safelyParseBaht(depositBaht) === 0
                  ) {
                    setDepositBaht("500.00");
                  }
                }}
                className="form-input"
              >
                {channels.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            {channel === "LINE" && (
              <Field label="LINE user ID" required>
                <input
                  required
                  value={lineUserId}
                  onChange={(event) => setLineUserId(event.target.value)}
                  className="form-input"
                  placeholder="Uxxxxxxxx"
                />
              </Field>
            )}
            {allowDirectCheckIn && (
              <Field label="มัดจำที่รับแล้วสำหรับเช็คอินทันที (บาท)">
                <input
                  type="number"
                  min="0"
                  max="21474836.47"
                  step="0.01"
                  value={depositBaht}
                  onChange={(event) => setDepositBaht(event.target.value)}
                  className="form-input"
                  inputMode="decimal"
                />
                <span className="mt-1 block text-xs font-normal text-slate-600">
                  ช่องทาง LINE ต้องรับมัดจำรวมอย่างน้อย 500 บาทต่อ booking group
                </span>
              </Field>
            )}
            <div className="sm:col-span-2">
              <Field label="หมายเหตุถึงคลินิก (ไม่บังคับ)">
                <textarea
                  value={customerNotes}
                  onChange={(event) => setCustomerNotes(event.target.value)}
                  className="form-input min-h-24"
                  maxLength={1000}
                />
              </Field>
            </div>
          </div>
        </section>

        <div className="space-y-4">
          {units.map((unit, unitIndex) => (
            <section
              key={unit.key}
              className="rounded-2xl border border-emerald-900/10 bg-white p-5 shadow-sm sm:p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold">ห้องที่ {unitIndex + 1}</h2>
                {units.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setUnits((current) =>
                        current.filter((_, index) => index !== unitIndex),
                      )
                    }
                    className="min-h-11 rounded-xl px-3 text-sm font-semibold text-red-700 hover:bg-red-50"
                  >
                    ลบห้อง
                  </button>
                )}
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="ชนิดสัตว์" required>
                  <select
                    value={unit.species}
                    onChange={(event) =>
                      updateUnit(unitIndex, {
                        species: event.target.value as Species,
                        roomId: "",
                      })
                    }
                    className="form-input"
                  >
                    <option value="CAT">แมว</option>
                    <option value="DOG">สุนัข</option>
                  </select>
                </Field>
                <Field label="ห้องที่ว่างตลอดช่วง" required>
                  <select
                    required
                    value={unit.roomId}
                    onChange={(event) =>
                      updateUnit(unitIndex, { roomId: event.target.value })
                    }
                    className="form-input"
                    disabled={roomState === "loading"}
                  >
                    <option value="">
                      {roomState === "loading"
                        ? "กำลังค้นหาห้อง…"
                        : "เลือกห้อง"}
                    </option>
                    {rooms[unit.species].map((room) => (
                      <option
                        key={room.room_id}
                        value={room.room_id}
                        disabled={
                          selectedRoomIds.has(room.room_id) &&
                          room.room_id !== unit.roomId
                        }
                      >
                        {room.room_code}
                      </option>
                    ))}
                  </select>
                  {roomState === "error" && (
                    <p className="mt-1 text-xs text-red-700">
                      ค้นหาห้องไม่สำเร็จ กรุณาเปลี่ยนวันที่แล้วลองใหม่
                    </p>
                  )}
                </Field>
                <Field label="ค่าห้องพัก/คืน (บาท)" required>
                  <input
                    type="number"
                    min="1"
                    max="21474836.47"
                    step="0.01"
                    value={unit.nightlyRateBaht}
                    onChange={(event) =>
                      updateUnit(unitIndex, {
                        nightlyRateBaht: event.target.value,
                      })
                    }
                    className="form-input"
                    inputMode="decimal"
                    aria-label={`ค่าห้องพักต่อคืน ห้องที่ ${unitIndex + 1}`}
                    required
                  />
                  <span className="mt-1 block text-xs font-normal text-slate-600">
                    ค่ามาตรฐาน 1 ตัว 150 บาท · 2 ตัว 200 บาท
                  </span>
                </Field>
                <Field label="จำนวนสัตว์" required>
                  <select
                    value={unit.pets.length}
                    onChange={(event) => {
                      const count = Number(event.target.value);
                      const previousStandardRateSatang =
                        unit.pets.length === 1 ? 15_000 : 20_000;
                      const nextStandardRate =
                        count === 1 ? "150.00" : "200.00";
                      updateUnit(unitIndex, {
                        nightlyRateBaht:
                          safelyParseBaht(unit.nightlyRateBaht) ===
                          previousStandardRateSatang
                            ? nextStandardRate
                            : unit.nightlyRateBaht,
                        pets:
                          count === 1
                            ? unit.pets.slice(0, 1)
                            : [
                                unit.pets[0] ?? newPet(),
                                unit.pets[1] ?? newPet(),
                              ],
                      });
                    }}
                    className="form-input"
                  >
                    <option value={1}>1 ตัว</option>
                    <option value={2}>2 ตัว (อยู่ร่วมกันได้)</option>
                  </select>
                </Field>
                <Field label="หมายเหตุของห้อง (ไม่บังคับ)">
                  <input
                    value={unit.notes}
                    onChange={(event) =>
                      updateUnit(unitIndex, { notes: event.target.value })
                    }
                    className="form-input"
                    maxLength={500}
                  />
                </Field>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {unit.pets.map((pet, petIndex) => (
                  <fieldset
                    key={petIndex}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <legend className="px-2 font-semibold">
                      สัตว์ตัวที่ {petIndex + 1}
                    </legend>
                    <div className="space-y-4">
                      <Field label="ชื่อสัตว์" required>
                        <input
                          required
                          value={pet.name}
                          onChange={(event) =>
                            updatePet(unitIndex, petIndex, {
                              name: event.target.value,
                            })
                          }
                          className="form-input"
                        />
                      </Field>
                      <Field
                        label={`น้ำหนัก (กก.)${unit.species === "CAT" ? " — ไม่บังคับ" : ""}`}
                        required={unit.species === "DOG"}
                      >
                        <input
                          required={unit.species === "DOG"}
                          type="number"
                          min="0.01"
                          max={
                            unit.species === "DOG"
                              ? unit.pets.length === 1
                                ? 20
                                : 8
                              : undefined
                          }
                          step="0.01"
                          value={pet.weightKg}
                          onChange={(event) =>
                            updatePet(unitIndex, petIndex, {
                              weightKg: event.target.value,
                            })
                          }
                          className="form-input"
                        />
                      </Field>
                      <Field label="การป้องกันเห็บหมัด">
                        <select
                          value={
                            pet.fleaTickTreated === undefined
                              ? "UNKNOWN"
                              : pet.fleaTickTreated
                                ? "YES"
                                : "NO"
                          }
                          onChange={(event) =>
                            updatePet(unitIndex, petIndex, {
                              fleaTickTreated:
                                event.target.value === "UNKNOWN"
                                  ? undefined
                                  : event.target.value === "YES",
                            })
                          }
                          className="form-input"
                        >
                          <option value="UNKNOWN">ไม่ทราบ/ยังไม่ระบุ</option>
                          <option value="YES">ทำแล้ว</option>
                          <option value="NO">ยังไม่ได้ทำ</option>
                        </select>
                      </Field>
                    </div>
                  </fieldset>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="flex flex-wrap justify-between gap-3">
          <button
            type="button"
            disabled={units.length >= 18}
            onClick={() => setUnits((current) => [...current, newUnit()])}
            className="min-h-12 rounded-xl border border-[#123c2f] bg-white px-5 font-semibold text-[#123c2f] disabled:opacity-50"
          >
            + เพิ่มอีกห้อง
          </button>
          <div className="space-y-2">
            {allowDirectCheckIn && activeRegistryCustomer && (
              <p className="max-w-md text-right text-xs text-slate-600">
                ข้อมูลจากทะเบียนเดิมรองรับการสร้างคำขอจองในขั้นตอนนี้
                จากนั้นเช็คอินจากการ์ดห้องเมื่อรายการพร้อม
              </p>
            )}
            <BookingSubmitButton
              allowDirectCheckIn={allowDirectCheckIn && !activeRegistryCustomer}
            />
          </div>
        </div>
      </form>
    </div>
  );
}

function safelyParseBaht(value: string): number | null {
  try {
    return parseBahtToSatang(value);
  } catch {
    return null;
  }
}

function Field({
  label,
  required = false,
  children,
}: {
  readonly label: string;
  readonly required?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-800">
      <span>
        {label} {required && <span className="text-red-700">*</span>}
      </span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
