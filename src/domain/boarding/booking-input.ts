import { z } from "zod";

import { assertRoomCapacity } from "./capacity";
import { assertIsoDateRange } from "./date-range";

const optionalWeightSchema = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.coerce.number().positive().max(999).nullable(),
);

export const bookingPetInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  weightKg: optionalWeightSchema,
  fleaTickTreated: z.boolean().optional(),
  fleaTickProduct: z.string().trim().max(120).optional(),
  fleaTickTreatedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
});

export const bookingUnitInputSchema = z
  .object({
    species: z.enum(["CAT", "DOG"]),
    roomId: z.uuid(),
    nightlyRateSatang: z.number().int().positive().max(2_147_483_647),
    notes: z.string().trim().max(500).optional(),
    pets: z.array(bookingPetInputSchema).min(1).max(2),
  })
  .superRefine((unit, context) => {
    try {
      assertRoomCapacity(unit.species, unit.pets);
    } catch (error) {
      context.addIssue({
        code: "custom",
        path: ["pets"],
        message:
          error instanceof Error ? error.message : "ข้อมูลสัตว์ไม่ถูกต้อง",
      });
    }
  });

const bookingDatesSchema = z
  .object({
    checkInDate: z.string(),
    checkOutDate: z.string(),
  })
  .superRefine((dates, context) => {
    try {
      assertIsoDateRange({
        startDate: dates.checkInDate,
        endDate: dates.checkOutDate,
      });
    } catch (error) {
      context.addIssue({
        code: "custom",
        path: ["checkOutDate"],
        message:
          error instanceof Error ? error.message : "ช่วงวันที่ไม่ถูกต้อง",
      });
    }
  });

const customerSchema = z.object({
  customerName: z.string().trim().min(1).max(200),
  customerPhone: z
    .string()
    .transform(normalizePhone)
    .pipe(z.string().regex(/^\+?[0-9]{8,15}$/)),
  customerNotes: z.string().trim().max(1_000).optional(),
});

export const backOfficeBookingSchema = z
  .object({
    ...customerSchema.shape,
    ...bookingDatesSchema.shape,
    channel: z.enum([
      "WEBSITE",
      "LINE",
      "FACEBOOK",
      "PHONE",
      "WALK_IN",
      "OTHER",
    ]),
    lineUserId: z.string().trim().max(200).optional(),
    depositSatang: z.number().int().min(0).max(2_147_483_647),
    idempotencyKey: z.string().min(16).max(200),
    units: z.array(bookingUnitInputSchema).min(1).max(18),
  })
  .superRefine((input, context) => {
    validateDates(input, context);
    if (input.channel === "LINE" && !input.lineUserId) {
      context.addIssue({
        code: "custom",
        path: ["lineUserId"],
        message: "การจองผ่าน LINE ต้องมี LINE user ID",
      });
    }
    const roomIds = input.units.map(({ roomId }) => roomId);
    if (new Set(roomIds).size !== roomIds.length) {
      context.addIssue({
        code: "custom",
        path: ["units"],
        message: "ไม่สามารถเลือกห้องซ้ำในรายการเดียวกันได้",
      });
    }
  });

export const publicBookingRequestSchema = z
  .object({
    ...customerSchema.shape,
    ...bookingDatesSchema.shape,
    species: z.enum(["CAT", "DOG"]),
    pets: z.array(bookingPetInputSchema).min(1).max(2),
    idempotencyKey: z.string().min(16).max(200),
  })
  .superRefine((input, context) => {
    validateDates(input, context);
    try {
      assertRoomCapacity(input.species, input.pets);
    } catch (error) {
      context.addIssue({
        code: "custom",
        path: ["pets"],
        message:
          error instanceof Error ? error.message : "ข้อมูลสัตว์ไม่ถูกต้อง",
      });
    }
  });

export const availabilitySearchSchema = z
  .object({
    ...bookingDatesSchema.shape,
    species: z.enum(["CAT", "DOG"]),
    pets: z
      .array(bookingPetInputSchema.pick({ weightKg: true }))
      .min(1)
      .max(2),
  })
  .superRefine((input, context) => {
    validateDates(input, context);
    try {
      assertRoomCapacity(input.species, input.pets);
    } catch (error) {
      context.addIssue({
        code: "custom",
        path: ["pets"],
        message:
          error instanceof Error ? error.message : "ข้อมูลสัตว์ไม่ถูกต้อง",
      });
    }
  });

export type BackOfficeBookingInput = z.infer<typeof backOfficeBookingSchema>;
export type PublicBookingRequestInput = z.infer<
  typeof publicBookingRequestSchema
>;

export function normalizePhone(value: string): string {
  return value.replace(/[^0-9+]/g, "");
}

function validateDates(
  input: { readonly checkInDate: string; readonly checkOutDate: string },
  context: z.RefinementCtx,
): void {
  try {
    assertIsoDateRange({
      startDate: input.checkInDate,
      endDate: input.checkOutDate,
    });
  } catch (error) {
    context.addIssue({
      code: "custom",
      path: ["checkOutDate"],
      message: error instanceof Error ? error.message : "ช่วงวันที่ไม่ถูกต้อง",
    });
  }
}
