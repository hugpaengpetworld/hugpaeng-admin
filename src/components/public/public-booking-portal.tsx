"use client";

import { useMemo, useState } from "react";

import { addDays, todayInBangkok } from "@/domain/shared/date";

type Species = "CAT" | "DOG";

interface PublicPet {
  readonly name: string;
  readonly weightKg: string;
  readonly fleaTickTreated?: boolean;
}

interface AvailabilityResult {
  readonly availableCount: number;
  readonly nights: number;
  readonly nightlyRateSatang: number;
  readonly lodgingTotalSatang: number;
}

const blankPet = (): PublicPet => ({ name: "", weightKg: "" });

export function PublicBookingPortal() {
  const today = useMemo(() => todayInBangkok(), []);
  const [species, setSpecies] = useState<Species>("CAT");
  const [checkInDate, setCheckInDate] = useState(today);
  const [checkOutDate, setCheckOutDate] = useState(addDays(today, 1));
  const [pets, setPets] = useState<readonly PublicPet[]>([blankPet()]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [availability, setAvailability] = useState<AvailabilityResult | null>(
    null,
  );
  const [busy, setBusy] = useState<"availability" | "booking" | null>(null);
  const [message, setMessage] = useState<{
    readonly kind: "success" | "error";
    readonly text: string;
  } | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  const searchPayload = {
    species,
    checkInDate,
    checkOutDate,
    pets: pets.map(({ weightKg }) => ({ weightKg })),
  };

  function updatePet(index: number, update: Partial<PublicPet>) {
    setPets((current) =>
      current.map((pet, petIndex) =>
        petIndex === index ? { ...pet, ...update } : pet,
      ),
    );
    setAvailability(null);
  }

  async function searchAvailability() {
    setBusy("availability");
    setMessage(null);
    try {
      const response = await fetch("/api/public/availability", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(searchPayload),
      });
      const body = (await response.json()) as AvailabilityResult & {
        message?: string;
      };
      if (!response.ok) throw new Error(body.message ?? "ค้นหาห้องไม่สำเร็จ");
      setAvailability(body);
    } catch (error) {
      setAvailability(null);
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "ค้นหาห้องไม่สำเร็จ",
      });
    } finally {
      setBusy(null);
    }
  }

  async function submitBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("booking");
    setMessage(null);
    try {
      const submittedForm = new FormData(event.currentTarget);
      const requestBody = new FormData();
      requestBody.set(
        "payload",
        JSON.stringify({
          ...searchPayload,
          customerName,
          customerPhone,
          customerNotes,
          pets,
          idempotencyKey,
        }),
      );
      pets.forEach((_pet, index) => {
        const evidence = submittedForm.get(`vaccination-${index}`);
        if (evidence instanceof File && evidence.size > 0) {
          requestBody.append(`vaccination-${index}`, evidence);
        }
      });
      const response = await fetch("/api/public/booking-requests", {
        method: "POST",
        body: requestBody,
      });
      const body = (await response.json()) as {
        message?: string;
        bookingCodes?: string[];
      };
      if (!response.ok) throw new Error(body.message ?? "ส่งคำขอไม่สำเร็จ");
      setMessage({
        kind: "success",
        text: `${body.message ?? "รับคำขอแล้ว"} รหัสการจอง ${body.bookingCodes?.join(", ") ?? ""}`,
      });
      setAvailability(null);
      setIdempotencyKey(crypto.randomUUID());
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "ส่งคำขอไม่สำเร็จ",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <form
      onSubmit={submitBooking}
      className="rounded-3xl border border-emerald-900/10 bg-white p-5 shadow-xl sm:p-7"
    >
      <h2 className="text-xl font-black text-[#123c2f]">
        ค้นหาและส่งคำขอฝากเลี้ยง
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        ระบบจะแสดงเฉพาะจำนวนห้องว่างและกันห้องอย่างปลอดภัยเมื่อส่งคำขอ
      </p>

      {message && (
        <div
          role={message.kind === "error" ? "alert" : "status"}
          className={`mt-5 rounded-xl border p-4 text-sm ${message.kind === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}
        >
          {message.text}
        </div>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <PublicField label="ชนิดสัตว์" required>
          <select
            value={species}
            onChange={(event) => {
              setSpecies(event.target.value as Species);
              setAvailability(null);
            }}
            className="form-input"
          >
            <option value="CAT">แมว</option>
            <option value="DOG">สุนัข</option>
          </select>
        </PublicField>
        <PublicField label="จำนวนสัตว์" required>
          <select
            value={pets.length}
            onChange={(event) => {
              const count = Number(event.target.value);
              setPets((current) =>
                count === 1
                  ? current.slice(0, 1)
                  : [current[0] ?? blankPet(), current[1] ?? blankPet()],
              );
              setAvailability(null);
            }}
            className="form-input"
          >
            <option value={1}>1 ตัว</option>
            <option value={2}>2 ตัว (อยู่ร่วมกันได้)</option>
          </select>
        </PublicField>
        <PublicField label="วันเข้าพัก" required>
          <input
            required
            type="date"
            min={today}
            value={checkInDate}
            onChange={(event) => {
              setCheckInDate(event.target.value);
              setAvailability(null);
            }}
            className="form-input"
          />
        </PublicField>
        <PublicField label="วันออก" required>
          <input
            required
            type="date"
            min={addDays(checkInDate, 1)}
            value={checkOutDate}
            onChange={(event) => {
              setCheckOutDate(event.target.value);
              setAvailability(null);
            }}
            className="form-input"
          />
        </PublicField>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {pets.map((pet, index) => (
          <fieldset
            key={index}
            className="rounded-xl border border-slate-200 p-4"
          >
            <legend className="px-2 font-bold">สัตว์ตัวที่ {index + 1}</legend>
            <div className="space-y-4">
              <PublicField label="ชื่อสัตว์" required>
                <input
                  required
                  value={pet.name}
                  onChange={(event) =>
                    updatePet(index, { name: event.target.value })
                  }
                  className="form-input"
                />
              </PublicField>
              <PublicField
                label={`น้ำหนัก (กก.)${species === "CAT" ? " — ไม่บังคับ" : ""}`}
                required={species === "DOG"}
              >
                <input
                  required={species === "DOG"}
                  type="number"
                  min="0.01"
                  max={
                    species === "DOG" ? (pets.length === 1 ? 20 : 8) : undefined
                  }
                  step="0.01"
                  value={pet.weightKg}
                  onChange={(event) =>
                    updatePet(index, { weightKg: event.target.value })
                  }
                  className="form-input"
                />
              </PublicField>
              <PublicField label="การป้องกันเห็บหมัด">
                <select
                  value={
                    pet.fleaTickTreated === undefined
                      ? "UNKNOWN"
                      : pet.fleaTickTreated
                        ? "YES"
                        : "NO"
                  }
                  onChange={(event) =>
                    updatePet(index, {
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
              </PublicField>
              <PublicField label="หลักฐานวัคซีน (ไม่บังคับ)">
                <input
                  name={`vaccination-${index}`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="form-input"
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  JPG, PNG, WebP หรือ PDF ไม่เกิน 10 MB
                </span>
              </PublicField>
            </div>
          </fieldset>
        ))}
      </div>

      <button
        type="button"
        disabled={busy !== null}
        onClick={searchAvailability}
        className="mt-5 min-h-12 w-full rounded-xl border border-[#123c2f] bg-white px-5 font-bold text-[#123c2f] disabled:opacity-60"
      >
        {busy === "availability" ? "กำลังค้นหา…" : "ตรวจจำนวนห้องว่างและราคา"}
      </button>

      {availability && (
        <div
          role="status"
          className="mt-4 rounded-xl bg-[#dcefe4] p-4 text-sm text-[#123c2f]"
        >
          <p className="font-bold">ว่าง {availability.availableCount} ห้อง</p>
          <p className="mt-1">
            {availability.nights} คืน · คืนละ{" "}
            {(availability.nightlyRateSatang / 100).toLocaleString("th-TH")} บาท
            · รวม{" "}
            {(availability.lodgingTotalSatang / 100).toLocaleString("th-TH")}{" "}
            บาท
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <PublicField label="ชื่อเจ้าของ" required>
          <input
            required
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            className="form-input"
            autoComplete="name"
          />
        </PublicField>
        <PublicField label="เบอร์โทรศัพท์" required>
          <input
            required
            value={customerPhone}
            onChange={(event) => setCustomerPhone(event.target.value)}
            className="form-input"
            inputMode="tel"
            autoComplete="tel"
          />
        </PublicField>
        <div className="sm:col-span-2">
          <PublicField label="หมายเหตุถึงคลินิก (ไม่บังคับ)">
            <textarea
              value={customerNotes}
              onChange={(event) => setCustomerNotes(event.target.value)}
              className="form-input min-h-24"
              maxLength={1000}
            />
          </PublicField>
        </div>
      </div>

      <button
        type="submit"
        disabled={busy !== null || availability?.availableCount === 0}
        className="mt-5 min-h-12 w-full rounded-xl bg-[#123c2f] px-5 font-bold text-white disabled:cursor-wait disabled:opacity-60"
      >
        {busy === "booking" ? "กำลังส่งคำขอ…" : "ส่งคำขอจอง"}
      </button>
      <p className="mt-3 text-xs leading-5 text-slate-500">
        การส่งคำขอยังไม่ใช่การยืนยัน คลินิกจะตรวจสอบและติดต่อกลับอีกครั้ง
      </p>
    </form>
  );
}

function PublicField({
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
      {label} {required && <span className="text-red-700">*</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
