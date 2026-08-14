import "server-only";

import type { SupportContext } from "@/data/auth/support-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SupportOverviewMetric {
  readonly label: string;
  readonly value: number;
  readonly scope: string;
}

export async function getSupportOverview(
  context: SupportContext,
): Promise<readonly SupportOverviewMetric[]> {
  const supabase = await createSupabaseServerClient();
  const definitions = [
    { scope: "BOOKING_READ", table: "bookings", label: "รายการจอง" },
    { scope: "CUSTOMER_READ", table: "customers", label: "ลูกค้า" },
    { scope: "ROOM_READ", table: "room_inventory", label: "ห้องพัก" },
    { scope: "FINANCE_READ", table: "receipts", label: "ใบเสร็จ" },
    {
      scope: "STERILIZATION_READ",
      table: "sterilization_appointments",
      label: "นัดทำหมัน",
    },
    {
      scope: "HEALTH_READ",
      table: "pet_health_profiles",
      label: "ข้อมูลสุขภาพ",
    },
    { scope: "AUDIT_READ", table: "audit_logs", label: "Audit events" },
  ] as const;
  const allowed = definitions.filter((item) =>
    context.scopes.includes(item.scope),
  );
  return Promise.all(
    allowed.map(async (item) => {
      const { count, error } = await supabase
        .from(item.table)
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", context.tenantId);
      if (error) throw new Error("SUPPORT_SCOPE_QUERY_FAILED");
      return { label: item.label, value: count ?? 0, scope: item.scope };
    }),
  );
}
