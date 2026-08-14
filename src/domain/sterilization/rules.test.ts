import { describe, expect, it } from "vitest";

import {
  canTransitionSterilizationStatus,
  getSterilizationCapacityTone,
  getSterilizationPetLabel,
  sterilizationAppointmentSchema,
  sterilizationConsumesCapacity,
} from "./rules";

describe("sterilization rules", () => {
  it("uses green below four, red at four, and purple above four", () => {
    expect(getSterilizationCapacityTone(0)).toBe("AVAILABLE");
    expect(getSterilizationCapacityTone(3)).toBe("AVAILABLE");
    expect(getSterilizationCapacityTone(4)).toBe("FULL");
    expect(getSterilizationCapacityTone(5)).toBe("OVERBOOKED");
  });

  it("counts only pending, confirmed, and arrived appointments", () => {
    expect(sterilizationConsumesCapacity("PENDING_CONFIRMATION")).toBe(true);
    expect(sterilizationConsumesCapacity("CONFIRMED")).toBe(true);
    expect(sterilizationConsumesCapacity("ARRIVED")).toBe(true);
    expect(sterilizationConsumesCapacity("COMPLETED")).toBe(false);
    expect(sterilizationConsumesCapacity("CANCELLED")).toBe(false);
    expect(sterilizationConsumesCapacity("NO_SHOW")).toBe(false);
  });

  it("requires a custom species only for other animals", () => {
    const base = {
      appointmentDate: "2026-08-10",
      appointmentTime: "09:00",
      customerName: "เจ้าของ",
      phone: "0812345678",
      petName: "มะลิ",
      sex: "FEMALE" as const,
      sourceChannel: "PHONE" as const,
      acknowledgeOverbook: false,
      holidayOverride: false,
    };
    expect(
      sterilizationAppointmentSchema.safeParse({ ...base, species: "OTHER" })
        .success,
    ).toBe(false);
    expect(
      sterilizationAppointmentSchema.safeParse({
        ...base,
        species: "OTHER",
        customSpecies: "กระต่าย",
      }).success,
    ).toBe(true);
    expect(
      sterilizationAppointmentSchema.safeParse({
        ...base,
        species: "CAT",
        customSpecies: "กระต่าย",
      }).success,
    ).toBe(false);
  });

  it("preserves the accepted cat and dog calendar label convention", () => {
    expect(
      getSterilizationPetLabel({
        species: "CAT",
        petName: "มะลิ",
        sex: "FEMALE",
      }),
    ).toBe("F-มะลิ/เมีย");
    expect(
      getSterilizationPetLabel({
        species: "DOG",
        petName: "โบ้",
        sex: "MALE",
      }),
    ).toBe("C-โบ้/ผู้");
  });

  it("allows only the documented forward status paths", () => {
    expect(
      canTransitionSterilizationStatus("PENDING_CONFIRMATION", "CONFIRMED"),
    ).toBe(true);
    expect(canTransitionSterilizationStatus("CONFIRMED", "ARRIVED")).toBe(true);
    expect(canTransitionSterilizationStatus("ARRIVED", "COMPLETED")).toBe(true);
    expect(canTransitionSterilizationStatus("COMPLETED", "CONFIRMED")).toBe(
      false,
    );
    expect(canTransitionSterilizationStatus("CANCELLED", "CONFIRMED")).toBe(
      false,
    );
  });
});
