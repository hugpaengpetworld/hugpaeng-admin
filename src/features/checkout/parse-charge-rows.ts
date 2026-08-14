import {
  CHARGE_CATEGORY_LABELS,
  type ChargeCategory,
  type ChargeInput,
  isChargeCategory,
  parseBahtToSatang,
} from "@/domain/finance/settlement";

export interface CheckoutChargeRowInput {
  readonly category: string;
  readonly amount: string;
  readonly detail: string;
}

const categoriesWithBuiltInReceiptNames: readonly ChargeCategory[] = [
  "FOOD",
  "MEDICINE",
  "IV_FLUIDS",
  "BLOOD_TEST",
];

export function parseCheckoutChargeRows(
  rows: readonly CheckoutChargeRowInput[],
): ChargeInput[] {
  if (rows.length > 50) throw new RangeError("INVALID_CHARGE");
  const charges: ChargeInput[] = [];
  for (const row of rows) {
    const category = row.category.trim();
    const amount = row.amount.trim();
    const detail = row.detail.trim();
    if (!category && !amount && !detail) continue;
    if (!isChargeCategory(category) || !amount) {
      throw new RangeError("INVALID_CHARGE");
    }
    charges.push({
      category,
      amountSatang: parseBahtToSatang(amount),
      detail: chargeDetail(category, detail),
    });
  }
  return charges;
}

function chargeDetail(
  category: ChargeCategory,
  detail: string,
): string | undefined {
  if (category === "OTHER") {
    if (!detail) throw new RangeError("INVALID_CHARGE");
    return detail;
  }
  return categoriesWithBuiltInReceiptNames.includes(category)
    ? undefined
    : CHARGE_CATEGORY_LABELS[category];
}
