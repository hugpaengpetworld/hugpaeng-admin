import {
  assertRoomCapacity,
  type BoardingAnimal,
  type BoardingSpecies,
} from "./capacity";

export type Satang = number & { readonly __brand: "Satang" };

const ONE_ANIMAL_NIGHTLY_SATANG = 15_000;
const TWO_ANIMAL_NIGHTLY_SATANG = 20_000;
const DAY_CARE_HOURLY_SATANG = 5_000;
const DAY_CARE_MAXIMUM_SATANG = 15_000;

export function calculateOvernightPrice(input: {
  readonly species: BoardingSpecies;
  readonly animals: readonly BoardingAnimal[];
  readonly nights: number;
}): Satang {
  assertRoomCapacity(input.species, input.animals);
  if (!Number.isInteger(input.nights) || input.nights < 1) {
    throw new RangeError("จำนวนคืนต้องเป็นจำนวนเต็มอย่างน้อยหนึ่งคืน");
  }

  const nightlyRate =
    input.animals.length === 1
      ? ONE_ANIMAL_NIGHTLY_SATANG
      : TWO_ANIMAL_NIGHTLY_SATANG;
  return asSatang(nightlyRate * input.nights);
}

export function calculateDayCarePrice(durationMinutes: number): Satang {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 0) {
    throw new RangeError("ระยะเวลาต้องเป็นจำนวนนาทีที่ไม่ติดลบ");
  }

  const wholeHours = Math.floor(durationMinutes / 60);
  const remainderMinutes = durationMinutes % 60;
  const billableHours = wholeHours + (remainderMinutes > 30 ? 1 : 0);
  return asSatang(
    Math.min(billableHours * DAY_CARE_HOURLY_SATANG, DAY_CARE_MAXIMUM_SATANG),
  );
}

function asSatang(value: number): Satang {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("จำนวนเงินไม่ถูกต้อง");
  }
  return value as Satang;
}
