export type BoardingSpecies = "CAT" | "DOG";

export interface BoardingAnimal {
  readonly weightKg?: number | null;
}

export class BoardingRuleError extends Error {
  constructor(
    readonly code:
      | "INVALID_ANIMAL_COUNT"
      | "DOG_WEIGHT_REQUIRED"
      | "DOG_WEIGHT_EXCEEDED"
      | "INVALID_WEIGHT",
    message: string,
  ) {
    super(message);
    this.name = "BoardingRuleError";
  }
}

export function assertRoomCapacity(
  species: BoardingSpecies,
  animals: readonly BoardingAnimal[],
): void {
  if (animals.length < 1 || animals.length > 2) {
    throw new BoardingRuleError(
      "INVALID_ANIMAL_COUNT",
      "หนึ่งห้องต้องมีสัตว์หนึ่งหรือสองตัว",
    );
  }

  if (species === "CAT") {
    assertOptionalWeightsAreValid(animals);
    return;
  }

  const weights = animals.map(({ weightKg }) => {
    if (weightKg === undefined || weightKg === null) {
      throw new BoardingRuleError(
        "DOG_WEIGHT_REQUIRED",
        "กรุณาระบุน้ำหนักสุนัขทุกตัว",
      );
    }
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      throw new BoardingRuleError("INVALID_WEIGHT", "น้ำหนักต้องมากกว่าศูนย์");
    }
    return weightKg;
  });

  const maximumWeight = animals.length === 1 ? 20 : 8;
  if (weights.some((weightKg) => weightKg > maximumWeight)) {
    throw new BoardingRuleError(
      "DOG_WEIGHT_EXCEEDED",
      animals.length === 1
        ? "สุนัขหนึ่งตัวต้องมีน้ำหนักไม่เกิน 20 กก."
        : "สุนัขสองตัวต้องมีน้ำหนักตัวละไม่เกิน 8 กก.",
    );
  }
}

function assertOptionalWeightsAreValid(
  animals: readonly BoardingAnimal[],
): void {
  for (const { weightKg } of animals) {
    if (
      weightKg !== undefined &&
      weightKg !== null &&
      (!Number.isFinite(weightKg) || weightKg <= 0)
    ) {
      throw new BoardingRuleError("INVALID_WEIGHT", "น้ำหนักต้องมากกว่าศูนย์");
    }
  }
}
