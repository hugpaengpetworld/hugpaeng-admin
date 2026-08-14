"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireTenantContext } from "@/data/auth/tenant-context";
import { isIsoDate } from "@/domain/shared/date";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const roomStateSchema = z.object({
  roomId: z.uuid(),
  newStatus: z.enum(["AVAILABLE", "CLEANING", "MAINTENANCE", "DISABLED"]),
  reason: z.string().trim().max(500),
  expectedVersion: z.coerce.number().int().positive(),
  species: z.enum(["CAT", "DOG"]),
  planDate: z.string().refine(isIsoDate),
});

const safeErrorCodes = [
  "VERSION_CONFLICT",
  "OPEN_STAY_EXISTS",
  "REASON_REQUIRED",
  "ROOM_STATE_UNCHANGED",
  "FORBIDDEN",
] as const;

const createRoomSchema = z.object({
  species: z.enum(["CAT", "DOG"]),
  planDate: z.string().refine(isIsoDate),
});

const createRoomSafeErrorCodes = [
  "FORBIDDEN",
  "INVALID_ROOM_SPECIES",
  "ROOM_NUMBER_EXHAUSTED",
] as const;

const retireRoomSchema = z.object({
  roomSelection: z.string().regex(/^[0-9a-f-]{36}\|[1-9][0-9]*$/i),
  reason: z.string().trim().min(3).max(500),
  species: z.enum(["CAT", "DOG"]),
  planDate: z.string().refine(isIsoDate),
});

const retireRoomSafeErrorCodes = [
  "FORBIDDEN",
  "ROOM_NOT_FOUND",
  "ROOM_ALREADY_RETIRED",
  "VERSION_CONFLICT",
  "RETIREMENT_REASON_REQUIRED",
  "OPEN_STAY_EXISTS",
  "ACTIVE_ROOM_ALLOCATION_EXISTS",
] as const;

export async function createRoomAction(formData: FormData): Promise<void> {
  const context = await requireTenantContext();
  const input = createRoomSchema.safeParse({
    species: formData.get("species"),
    planDate: formData.get("planDate"),
  });
  if (!input.success) redirect("/admin/rooms/cats?error=invalid_input");

  const basePath =
    input.data.species === "CAT" ? "/admin/rooms/cats" : "/admin/rooms/dogs";
  if (context.role !== "OWNER") {
    const query = new URLSearchParams({
      date: input.data.planDate,
      error: "FORBIDDEN",
    });
    redirect(`${basePath}?${query.toString()}`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_next_room", {
    p_tenant_id: context.tenantId,
    p_species: input.data.species,
  });
  if (error) {
    const safeCode = createRoomSafeErrorCodes.find((code) =>
      error.message.includes(code),
    );
    const query = new URLSearchParams({
      date: input.data.planDate,
      error: safeCode ?? "UNKNOWN",
    });
    redirect(`${basePath}?${query.toString()}`);
  }

  const created = (data as { room_code?: string }[] | null)?.[0];
  revalidatePath(basePath);
  const query = new URLSearchParams({
    date: input.data.planDate,
    success: "room_created",
  });
  if (created?.room_code) query.set("room", created.room_code);
  redirect(`${basePath}?${query.toString()}`);
}

export async function retireRoomAction(formData: FormData): Promise<void> {
  const context = await requireTenantContext();
  const input = retireRoomSchema.safeParse({
    roomSelection: formData.get("roomSelection"),
    reason: formData.get("reason"),
    species: formData.get("species"),
    planDate: formData.get("planDate"),
  });
  if (!input.success) redirect("/admin/rooms/cats?error=invalid_input");

  const basePath =
    input.data.species === "CAT" ? "/admin/rooms/cats" : "/admin/rooms/dogs";
  if (context.role !== "OWNER") {
    const query = new URLSearchParams({
      date: input.data.planDate,
      error: "FORBIDDEN",
    });
    redirect(`${basePath}?${query.toString()}`);
  }

  const [roomId = "", expectedVersionText = ""] =
    input.data.roomSelection.split("|");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("retire_room", {
    p_room_id: roomId,
    p_expected_version: Number(expectedVersionText),
    p_reason: input.data.reason,
  });
  if (error) {
    const safeCode = retireRoomSafeErrorCodes.find((code) =>
      error.message.includes(code),
    );
    const query = new URLSearchParams({
      date: input.data.planDate,
      error: safeCode ?? "UNKNOWN",
    });
    redirect(`${basePath}?${query.toString()}`);
  }

  const retired = (data as { room_code?: string }[] | null)?.[0];
  revalidatePath(basePath);
  const query = new URLSearchParams({
    date: input.data.planDate,
    success: "room_retired",
  });
  if (retired?.room_code) query.set("room", retired.room_code);
  redirect(`${basePath}?${query.toString()}`);
}

export async function changeRoomStateAction(formData: FormData): Promise<void> {
  await requireTenantContext();
  const input = roomStateSchema.safeParse({
    roomId: formData.get("roomId"),
    newStatus: formData.get("newStatus"),
    reason: formData.get("reason") ?? "",
    expectedVersion: formData.get("expectedVersion"),
    species: formData.get("species"),
    planDate: formData.get("planDate"),
  });
  const fallbackPath = "/admin/rooms/cats";
  if (!input.success) redirect(`${fallbackPath}?error=invalid_input`);

  const basePath =
    input.data.species === "CAT" ? "/admin/rooms/cats" : "/admin/rooms/dogs";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("change_room_operational_state", {
    p_room_id: input.data.roomId,
    p_new_status: input.data.newStatus,
    p_reason: input.data.reason,
    p_expected_version: input.data.expectedVersion,
  });
  if (error) {
    const safeCode = safeErrorCodes.find((code) =>
      error.message.includes(code),
    );
    const query = new URLSearchParams({
      date: input.data.planDate,
      error: safeCode ?? "UNKNOWN",
    });
    redirect(`${basePath}?${query.toString()}`);
  }

  revalidatePath(basePath);
  const query = new URLSearchParams({
    date: input.data.planDate,
    success: "state_updated",
  });
  redirect(`${basePath}?${query.toString()}`);
}
