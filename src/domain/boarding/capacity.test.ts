import { describe, expect, it } from "vitest";

import { assertRoomCapacity, BoardingRuleError } from "./capacity";

describe("room animal capacity", () => {
  it("accepts one or two cats without requiring weight", () => {
    expect(() => assertRoomCapacity("CAT", [{}])).not.toThrow();
    expect(() => assertRoomCapacity("CAT", [{}, {}])).not.toThrow();
  });

  it("rejects zero or more than two animals", () => {
    expect(() => assertRoomCapacity("CAT", [])).toThrowError(BoardingRuleError);
    expect(() =>
      assertRoomCapacity("DOG", [
        { weightKg: 1 },
        { weightKg: 1 },
        { weightKg: 1 },
      ]),
    ).toThrow("หนึ่งห้องต้องมีสัตว์หนึ่งหรือสองตัว");
  });

  it("accepts one dog up to 20 kg and requires its weight", () => {
    expect(() => assertRoomCapacity("DOG", [{ weightKg: 20 }])).not.toThrow();
    expect(() => assertRoomCapacity("DOG", [{}])).toThrow(
      "กรุณาระบุน้ำหนักสุนัขทุกตัว",
    );
    expect(() => assertRoomCapacity("DOG", [{ weightKg: 20.01 }])).toThrow(
      "สุนัขหนึ่งตัวต้องมีน้ำหนักไม่เกิน 20 กก.",
    );
  });

  it("allows two dogs only when each is at most 8 kg", () => {
    expect(() =>
      assertRoomCapacity("DOG", [{ weightKg: 8 }, { weightKg: 8 }]),
    ).not.toThrow();
    expect(() =>
      assertRoomCapacity("DOG", [{ weightKg: 8.01 }, { weightKg: 7 }]),
    ).toThrow("สุนัขสองตัวต้องมีน้ำหนักตัวละไม่เกิน 8 กก.");
  });
});
