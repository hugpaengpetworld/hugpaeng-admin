import { existsSync } from "node:fs";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

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
let page = 1;
while (true) {
  const { data, error } = await supabase.auth.admin.listUsers({
    page,
    perPage: 200,
  });
  if (error) throw new Error("AUTH_USER_LIST_FAILED");

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
  if (error) throw new Error("PLATFORM_ROLE_LIST_FAILED");
  platformRoles = data;
}

process.stdout.write(
  `${JSON.stringify(
    {
      testUserCount: testUsers.length,
      platformRoleCount: platformRoles.length,
      testUsers,
      platformRoles,
    },
    null,
    2,
  )}\n`,
);
