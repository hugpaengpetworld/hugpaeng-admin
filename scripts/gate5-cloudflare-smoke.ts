import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import process from "node:process";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const STAGING_PROJECT_REF = "wnnxdcxuxupmnplkegkt";
const STAGING_APP_HOST = "bmp-booking-staging.hugpaeng-petworld.workers.dev";
const TENANT_SLUG = "baan-mhor-poy";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const environment = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    CRON_SHARED_SECRET: z.string().min(32),
    STAGING_APP_URL: z.url(),
  })
  .parse({
    ...process.env,
    STAGING_APP_URL:
      process.env.STAGING_APP_URL ?? `https://${STAGING_APP_HOST}`,
  });

const supabaseHost = new URL(environment.NEXT_PUBLIC_SUPABASE_URL).hostname;
const appUrl = new URL(environment.STAGING_APP_URL);
if (supabaseHost !== `${STAGING_PROJECT_REF}.supabase.co`) {
  throw new Error("GATE5_SUPABASE_TARGET_MISMATCH");
}
if (appUrl.protocol !== "https:" || appUrl.hostname !== STAGING_APP_HOST) {
  throw new Error("GATE5_WORKER_TARGET_MISMATCH");
}

const admin = createClient(
  environment.NEXT_PUBLIC_SUPABASE_URL,
  environment.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const cookieJar = new Map<string, string>();
const authenticated = createServerClient(
  environment.NEXT_PUBLIC_SUPABASE_URL,
  environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    cookies: {
      getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) cookieJar.set(name, value);
      },
    },
  },
);

const email = `gate5-${randomUUID()}@example.invalid`;
const password = `${randomBytes(32).toString("base64url")}Aa1!`;
const phone = `08${String(Date.now()).slice(-8)}`;
const idempotencyKey = randomUUID();
let userId: string | undefined;

async function cleanupSyntheticAuthUsers(): Promise<void> {
  let page = 1;
  let deleted = 0;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw new Error(`GATE5_AUTH_LIST:${error.code}`);
    for (const user of data.users) {
      if (
        user.email?.startsWith("gate5-") &&
        user.email.endsWith("@example.invalid")
      ) {
        const { error: deleteError } = await admin.auth.admin.deleteUser(
          user.id,
          false,
        );
        if (deleteError) {
          throw new Error(`GATE5_AUTH_CLEANUP:${deleteError.code ?? "FAILED"}`);
        }
        deleted += 1;
      }
    }
    if (data.users.length < 200) break;
    page += 1;
  }
  process.stdout.write(`Removed ${deleted} synthetic Gate 5 Auth user(s).\n`);
}

async function verifyScheduledCron(): Promise<void> {
  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", TENANT_SLUG)
    .single();
  if (tenantError || !tenant) throw new Error("GATE5_TENANT_NOT_FOUND");

  const outboxId = randomUUID();
  const { error: insertError } = await admin.from("outbox_events").insert({
    id: outboxId,
    tenant_id: tenant.id,
    event_type: "GATE5_SCHEDULED_SMOKE",
    aggregate_type: "TENANT",
    aggregate_id: tenant.id,
    idempotency_key: `gate5-scheduled-smoke:${outboxId}`,
    payload: { synthetic: true },
  });
  if (insertError) throw insertError;

  try {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const { data, error } = await admin
        .from("outbox_events")
        .select("status, attempt_count")
        .eq("id", outboxId)
        .single();
      if (error) throw error;
      if (data.status === "SENT" && data.attempt_count === 1) {
        process.stdout.write(
          "Cloudflare scheduled event claimed and completed the staging outbox event.\n",
        );
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
    throw new Error("GATE5_SCHEDULED_CRON_TIMEOUT");
  } finally {
    const { error } = await admin
      .from("outbox_events")
      .delete()
      .eq("id", outboxId);
    if (error) throw new Error("GATE5_SCHEDULED_OUTBOX_CLEANUP_FAILED");
  }
}

function bangkokDate(offsetDays: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(Date.now() + offsetDays * 86_400_000));
  const value = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

function cookieHeader(): string {
  return [...cookieJar].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function expectHttp(
  path: string,
  init: RequestInit,
  expectedStatus: number,
  label: string,
): Promise<Response> {
  const response = await fetch(new URL(path, appUrl), {
    redirect: "manual",
    ...init,
  });
  if (response.status !== expectedStatus) {
    throw new Error(`${label}_HTTP_${response.status}`);
  }
  return response;
}

async function main(): Promise<void> {
  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", TENANT_SLUG)
    .single();
  if (tenantError || !tenant) throw new Error("GATE5_TENANT_NOT_FOUND");

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: "Gate 5 Smoke Owner" },
    });
  if (createError) throw new Error(`GATE5_AUTH_CREATE:${createError.code}`);
  userId = created.user.id;

  const { error: bootstrapError } = await admin.rpc(
    "bootstrap_first_tenant_owner",
    {
      p_tenant_slug: TENANT_SLUG,
      p_user_id: userId,
      p_display_name: "Gate 5 Smoke Owner",
    },
  );
  if (bootstrapError) throw bootstrapError;

  const { error: promptPayError } = await admin
    .from("tenant_settings")
    .update({
      promptpay_qr_enabled: true,
      promptpay_target_type: "MOBILE",
      promptpay_target_value: "0812345678",
      promptpay_payee_name: "Gate 5 Smoke Clinic",
    })
    .eq("tenant_id", tenant.id);
  if (promptPayError) throw promptPayError;

  const { data: signedIn, error: signInError } =
    await authenticated.auth.signInWithPassword({ email, password });
  if (signInError || signedIn.user.id !== userId) {
    throw new Error(`GATE5_AUTH_LOGIN:${signInError?.code ?? "MISMATCH"}`);
  }

  const publicHome = await expectHttp("/", {}, 200, "PUBLIC_HOME");
  if (!(await publicHome.text()).includes("BMP")) {
    throw new Error("PUBLIC_HOME_CONTENT_MISSING");
  }
  const protectedRedirect = await expectHttp(
    "/admin",
    {},
    307,
    "ADMIN_SESSION_GUARD",
  );
  if (!protectedRedirect.headers.get("location")?.includes("/admin/login")) {
    throw new Error("ADMIN_SESSION_GUARD_LOCATION");
  }

  for (const path of [
    "/admin",
    "/admin/bookings",
    "/admin/rooms/cats",
    "/admin/rooms/dogs",
    "/admin/operations",
    "/admin/finance",
    "/admin/settings",
  ]) {
    const response = await expectHttp(
      path,
      { headers: { cookie: cookieHeader() } },
      200,
      `AUTH_PAGE_${path.replaceAll("/", "_")}`,
    );
    if ((await response.text()).includes("เข้าสู่ระบบหลังบ้าน")) {
      throw new Error(`AUTH_PAGE_REDIRECTED_${path}`);
    }
  }

  const checkInDate = bangkokDate(0);
  const checkOutDate = bangkokDate(1);
  const originHeaders = {
    origin: appUrl.origin,
    referer: `${appUrl.origin}/`,
    "user-agent": "BMP-Gate5-Smoke/1.0",
    "x-forwarded-for": "192.0.2.55",
  };
  const availability = await expectHttp(
    "/api/public/availability",
    {
      method: "POST",
      headers: { ...originHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        checkInDate,
        checkOutDate,
        species: "CAT",
        pets: [{ weightKg: null }],
      }),
    },
    200,
    "PUBLIC_AVAILABILITY",
  );
  const availabilityBody = (await availability.json()) as {
    ok?: boolean;
    availableCount?: number;
  };
  if (!availabilityBody.ok || !availabilityBody.availableCount) {
    throw new Error("PUBLIC_AVAILABILITY_EMPTY");
  }

  const bookingPayload = {
    customerName: "ลูกค้าทดสอบ Gate 5",
    customerPhone: phone,
    checkInDate,
    checkOutDate,
    species: "CAT",
    pets: [{ name: "แมวทดสอบ Gate 5", weightKg: null }],
    customerNotes: "ข้อมูลสังเคราะห์สำหรับ release gate",
    idempotencyKey,
  };
  const bookingForm = new FormData();
  bookingForm.set("payload", JSON.stringify(bookingPayload));
  const bookingRequest = await expectHttp(
    "/api/public/booking-requests",
    { method: "POST", headers: originHeaders, body: bookingForm },
    201,
    "PUBLIC_BOOKING",
  );
  const bookingBody = (await bookingRequest.json()) as {
    ok?: boolean;
    bookingCodes?: string[];
  };
  const bookingCode = bookingBody.bookingCodes?.[0];
  if (!bookingBody.ok || !bookingCode) {
    throw new Error("PUBLIC_BOOKING_RESULT_MISSING");
  }

  const bookingStatus = await expectHttp(
    "/api/public/booking-status",
    {
      method: "POST",
      headers: { ...originHeaders, "content-type": "application/json" },
      body: JSON.stringify({ bookingCode, phone }),
    },
    200,
    "PUBLIC_BOOKING_STATUS",
  );
  const statusBody = (await bookingStatus.json()) as { ok?: boolean };
  if (!statusBody.ok) throw new Error("PUBLIC_BOOKING_STATUS_RESULT");

  const { data: pending, error: pendingError } = await admin
    .from("bookings")
    .select("id, room_id, version, status")
    .eq("booking_code", bookingCode)
    .single();
  if (pendingError || !pending?.room_id)
    throw new Error("BOOKING_LOOKUP_FAILED");

  const { error: reviewError } = await authenticated.rpc("review_booking", {
    p_booking_id: pending.id,
    p_decision: "APPROVE",
    p_reason: "",
    p_expected_version: pending.version,
  });
  if (reviewError) throw reviewError;

  const { data: confirmed, error: confirmedError } = await admin
    .from("bookings")
    .select("version, status")
    .eq("id", pending.id)
    .single();
  if (confirmedError || confirmed.status !== "CONFIRMED") {
    throw new Error("BOOKING_APPROVAL_FAILED");
  }
  const { error: checkInError } = await authenticated.rpc("check_in_booking", {
    p_booking_id: pending.id,
    p_room_id: pending.room_id,
    p_deposit_satang: 0,
    p_notes: "Gate 5 staging check-in",
    p_expected_version: confirmed.version,
    p_idempotency_key: randomUUID(),
  });
  if (checkInError) throw checkInError;

  await expectHttp(
    `/admin/rooms/cats?date=${checkInDate}`,
    { headers: { cookie: cookieHeader() } },
    200,
    "ROOM_PLAN_AFTER_CHECKIN",
  );

  const { data: active, error: activeError } = await admin
    .from("bookings")
    .select("version, lodging_total_satang, status")
    .eq("id", pending.id)
    .single();
  if (activeError || active.status !== "CHECKED_IN") {
    throw new Error("BOOKING_CHECKIN_FAILED");
  }
  const { data: checkout, error: checkoutError } = await authenticated.rpc(
    "check_out_booking",
    {
      p_booking_id: pending.id,
      p_charges: [],
      p_payment: {
        method: "PROMPTPAY",
        quotedAmountSatang: active.lodging_total_satang,
        receivedConfirmed: true,
      },
      p_confirm_early_checkout: true,
      p_notes: "Gate 5 staging checkout",
      p_expected_version: active.version,
      p_idempotency_key: randomUUID(),
    },
  );
  if (checkoutError) throw checkoutError;
  const receiptId = (checkout as { receiptId?: string } | null)?.receiptId;
  if (!receiptId) throw new Error("CHECKOUT_RECEIPT_MISSING");

  const { data: receipt, error: receiptError } = await admin
    .from("receipts")
    .select("receipt_no, total_satang, payment_method, status")
    .eq("id", receiptId)
    .single();
  if (
    receiptError ||
    receipt.status !== "ISSUED" ||
    receipt.payment_method !== "PROMPTPAY" ||
    receipt.total_satang !== active.lodging_total_satang
  ) {
    throw new Error("PROMPTPAY_RECEIPT_FACTS_MISMATCH");
  }
  const receiptPrint = await expectHttp(
    `/admin/finance/receipts/${receiptId}/print`,
    { headers: { cookie: cookieHeader() } },
    200,
    "RECEIPT_PRINT",
  );
  if (!(await receiptPrint.text()).includes(receipt.receipt_no)) {
    throw new Error("RECEIPT_PRINT_CONTENT_MISSING");
  }

  const outboxId = randomUUID();
  const { error: outboxInsertError } = await admin
    .from("outbox_events")
    .insert({
      id: outboxId,
      tenant_id: tenant.id,
      event_type: "GATE5_SMOKE",
      aggregate_type: "BOOKING",
      aggregate_id: pending.id,
      idempotency_key: `gate5-smoke:${pending.id}`,
      payload: { synthetic: true },
    });
  if (outboxInsertError) throw outboxInsertError;

  await expectHttp(
    "/api/cron/booking-workflows",
    { method: "POST" },
    401,
    "CRON_UNAUTHORIZED",
  );
  const cron = await expectHttp(
    "/api/cron/booking-workflows",
    {
      method: "POST",
      headers: { authorization: `Bearer ${environment.CRON_SHARED_SECRET}` },
    },
    200,
    "CRON_AUTHORIZED",
  );
  const cronBody = (await cron.json()) as {
    ok?: boolean;
    claimed?: number;
    sent?: number;
  };
  if (!cronBody.ok || !cronBody.claimed || !cronBody.sent) {
    throw new Error("CRON_OUTBOX_NOT_PROCESSED");
  }
  const { data: outbox, error: outboxError } = await admin
    .from("outbox_events")
    .select("status, attempt_count")
    .eq("id", outboxId)
    .single();
  if (outboxError || outbox.status !== "SENT" || outbox.attempt_count !== 1) {
    throw new Error("OUTBOX_FACTS_MISMATCH");
  }

  process.stdout.write(
    [
      "Gate 5 Cloudflare staging smoke passed:",
      "- public home, availability, booking request, and status",
      "- Auth login and protected admin pages",
      "- booking approval, room planning, check-in, and check-out",
      "- Dynamic PromptPay settlement and immutable receipt print",
      "- cron authorization and outbox claim/dispatch/completion",
    ].join("\n") + "\n",
  );
}

if (process.argv.includes("--cleanup-auth-only")) {
  await cleanupSyntheticAuthUsers();
} else if (process.argv.includes("--verify-scheduled-cron")) {
  await verifyScheduledCron();
} else {
  try {
    await main();
  } finally {
    if (userId) {
      const { error } = await admin.auth.admin.deleteUser(userId, false);
      if (error) {
        process.stdout.write(
          "Synthetic Auth cleanup is deferred until after the CLEAN staging database reset.\n",
        );
      }
    }
  }
}
