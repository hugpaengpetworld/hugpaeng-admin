import { existsSync } from "node:fs";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const environmentFile = process.env.APP_ENV_FILE ?? ".env.local";
if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);

const environment = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  })
  .parse(process.env);

const supabase = createClient(
  environment.NEXT_PUBLIC_SUPABASE_URL,
  environment.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const testUsers: { id: string; email: string }[] = [];
let totalAuthUserCount = 0;
let page = 1;
while (true) {
  const { data, error } = await supabase.auth.admin.listUsers({
    page,
    perPage: 200,
  });
  if (error) {
    throw new Error(
      `AUTH_USER_LIST_FAILED:${error.code ?? "UNKNOWN"}:${error.message}`,
    );
  }

  totalAuthUserCount += data.users.length;
  for (const user of data.users) {
    const email = user.email?.toLowerCase();
    if (email?.endsWith("@example.invalid")) {
      testUsers.push({ id: user.id, email });
    }
  }
  if (data.users.length < 200) break;
  page += 1;
}

let platformRoles: {
  id: string;
  user_id: string;
  role: string;
  assigned_by: string | null;
}[] = [];
if (testUsers.length > 0) {
  const { data, error } = await supabase
    .from("platform_roles")
    .select("id,user_id,role,assigned_by")
    .in(
      "user_id",
      testUsers.map((user) => user.id),
    );
  if (error) {
    throw new Error(
      `PLATFORM_ROLE_LIST_FAILED:${error.code ?? "UNKNOWN"}:${error.message}`,
    );
  }
  platformRoles = data;
}

async function countRows(table: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true });
  if (error) {
    throw new Error(
      `ROW_COUNT_FAILED:${table}:${error.code ?? "UNKNOWN"}:${error.message}`,
    );
  }
  return count ?? 0;
}

const [
  tenantCount,
  membershipCount,
  customerCount,
  petCount,
  bookingGroupCount,
  receiptCount,
] = await Promise.all([
  countRows("tenants"),
  countRows("tenant_memberships"),
  countRows("customers"),
  countRows("pets"),
  countRows("booking_groups"),
  countRows("receipts"),
]);

if (
  process.env.REQUIRE_CLEAN_TEST_FIXTURES === "1" &&
  (totalAuthUserCount !== 0 ||
    testUsers.length !== 0 ||
    platformRoles.length !== 0 ||
    tenantCount !== 1 ||
    membershipCount !== 0 ||
    customerCount !== 0 ||
    petCount !== 0 ||
    bookingGroupCount !== 0 ||
    receiptCount !== 0)
) {
  throw new Error("TEST_FIXTURE_AUDIT_NOT_CLEAN");
}

process.stdout.write(
  `${JSON.stringify(
    {
      totalAuthUserCount,
      testUserCount: testUsers.length,
      platformRoleCount: platformRoles.length,
      rowCounts: {
        tenants: tenantCount,
        tenantMemberships: membershipCount,
        customers: customerCount,
        pets: petCount,
        bookingGroups: bookingGroupCount,
        receipts: receiptCount,
      },
      testUsers,
      platformRoles,
    },
    null,
    2,
  )}\n`,
);
