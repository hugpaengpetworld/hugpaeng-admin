import { existsSync } from "node:fs";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const inputSchema = z.object({
  email: z.email(),
  role: z.enum(["PLATFORM_OWNER", "SUPPORT_AGENT"]),
});
const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

const input = inputSchema.parse({
  email: argument("--email"),
  role: argument("--role")?.toUpperCase(),
});
const env = envSchema.parse(process.env);
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

let page = 1;
let userId: string | null = null;
while (!userId) {
  const { data, error } = await supabase.auth.admin.listUsers({
    page,
    perPage: 200,
  });
  if (error) throw new Error("AUTH_USER_LIST_FAILED");
  userId =
    data.users.find(
      (user) => user.email?.toLowerCase() === input.email.toLowerCase(),
    )?.id ?? null;
  if (userId || data.users.length < 200) break;
  page += 1;
}
if (!userId) throw new Error("AUTH_USER_NOT_FOUND");

const { error: profileError } = await supabase
  .from("profiles")
  .upsert(
    { user_id: userId, display_name: input.email.split("@")[0] },
    { onConflict: "user_id", ignoreDuplicates: true },
  );
if (profileError) throw new Error("PROFILE_UPSERT_FAILED");
const { error: roleError } = await supabase
  .from("platform_roles")
  .upsert(
    { user_id: userId, role: input.role, is_active: true, assigned_by: userId },
    { onConflict: "user_id,role" },
  );
if (roleError) throw new Error("PLATFORM_ROLE_ASSIGNMENT_FAILED");
process.stdout.write(`Assigned ${input.role} to ${input.email}\n`);

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
