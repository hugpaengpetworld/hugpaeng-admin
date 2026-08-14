import { existsSync } from "node:fs";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const inputSchema = z.object({
  email: z.email(),
  password: z.string().min(12).max(128),
});

const environmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DEFAULT_TENANT_SLUG: z.string().min(1),
  INITIAL_OWNER_EMAIL: z.email(),
});

async function main(): Promise<void> {
  const environment = environmentSchema.parse(process.env);
  const input = inputSchema.parse({
    email: environment.INITIAL_OWNER_EMAIL,
    password: process.env.BMP_OWNER_PASSWORD,
  });
  const supabase = createClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );

  let page = 1;
  let userId: string | undefined;
  while (!userId) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw new Error("OWNER_LOOKUP_FAILED");
    userId = data.users.find(
      (candidate) =>
        candidate.email?.toLowerCase() === input.email.toLowerCase(),
    )?.id;
    if (userId || data.users.length < 200) break;
    page += 1;
  }
  if (!userId) throw new Error("OWNER_ACCOUNT_NOT_FOUND");

  const { error: updateError } = await supabase.auth.admin.updateUserById(
    userId,
    {
      password: input.password,
      email_confirm: true,
    },
  );
  if (updateError) throw new Error("OWNER_PASSWORD_UPDATE_FAILED");

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", environment.DEFAULT_TENANT_SLUG)
    .single();
  if (tenantError)
    throw new Error("OWNER_PASSWORD_UPDATED_AUDIT_TENANT_FAILED");

  const { error: auditError } = await supabase.from("audit_logs").insert({
    tenant_id: tenant.id,
    actor_user_id: userId,
    action: "INITIAL_OWNER_PASSWORD_SET",
    entity_type: "AUTH_USER",
    entity_id: userId,
    after_summary: {
      email_confirmed: true,
      method: "LOCAL_ADMIN_SCRIPT",
    },
  });
  if (auditError) throw new Error("OWNER_PASSWORD_UPDATED_AUDIT_FAILED");

  const publicClient = createClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  const { data: verification, error: verificationError } =
    await publicClient.auth.signInWithPassword(input);
  if (verificationError || verification.user.id !== userId) {
    throw new Error(
      `OWNER_PASSWORD_UPDATED_LOGIN_VERIFICATION_FAILED:${verificationError?.code ?? "USER_MISMATCH"}`,
    );
  }
  await publicClient.auth.signOut({ scope: "local" });

  process.stdout.write(
    "OWNER password updated, login verified, and audit event recorded.\n",
  );
}

await main();
