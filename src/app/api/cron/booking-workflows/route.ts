import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { sendLineOutboxEvent } from "@/integrations/line/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

interface ClaimedEvent {
  readonly event_id: string;
  readonly event_type: string;
  readonly payload: Record<string, unknown>;
  readonly attempt_count: number;
}

export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const supabase = createSupabaseAdminClient();
  const { data: expired, error: expiryError } = await supabase.rpc(
    "expire_due_line_deposits",
    { p_limit: 100 },
  );
  if (expiryError) {
    return NextResponse.json({ error: "EXPIRY_FAILED" }, { status: 503 });
  }

  const { data: supportGrantsUpdated, error: supportGrantError } =
    await supabase.rpc("refresh_support_grant_statuses");
  if (supportGrantError) {
    return NextResponse.json(
      { error: "SUPPORT_GRANT_REFRESH_FAILED" },
      { status: 503 },
    );
  }

  const { data, error: claimError } = await supabase.rpc(
    "claim_outbox_events",
    {
      p_limit: 20,
    },
  );
  if (claimError) {
    return NextResponse.json({ error: "OUTBOX_CLAIM_FAILED" }, { status: 503 });
  }

  let sent = 0;
  let failed = 0;
  for (const event of (data ?? []) as ClaimedEvent[]) {
    try {
      await sendLineOutboxEvent({
        eventId: event.event_id,
        eventType: event.event_type,
        payload: event.payload,
      });
      await supabase.rpc("complete_outbox_event", {
        p_event_id: event.event_id,
        p_succeeded: true,
        p_error_code: null,
        p_retry_at: null,
      });
      sent += 1;
    } catch (eventError) {
      const errorCode =
        eventError instanceof Error
          ? eventError.message.slice(0, 100)
          : "UNKNOWN";
      const retryDelayMinutes = Math.min(60, 2 ** event.attempt_count);
      await supabase.rpc("complete_outbox_event", {
        p_event_id: event.event_id,
        p_succeeded: false,
        p_error_code: errorCode,
        p_retry_at: new Date(
          Date.now() + retryDelayMinutes * 60_000,
        ).toISOString(),
      });
      failed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    expired,
    supportGrantsUpdated,
    claimed: data?.length ?? 0,
    sent,
    failed,
  });
}

function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SHARED_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || secret.length < 32 || !authorization?.startsWith("Bearer "))
    return false;
  const provided = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}
