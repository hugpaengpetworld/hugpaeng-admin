import { randomBytes, randomUUID } from "node:crypto";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const TARGET_PROJECT_REF = "svgmzjphmdqfeptalxhe";

const environment = z
  .object({
    TARGET_SUPABASE_URL: z.url(),
    TARGET_SUPABASE_ANON_KEY: z.string().min(1),
    TARGET_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  })
  .parse(process.env);

if (
  new URL(environment.TARGET_SUPABASE_URL).hostname !==
  `${TARGET_PROJECT_REF}.supabase.co`
) {
  throw new Error("AUTH_SMOKE_TARGET_MISMATCH");
}

const adminClient = createClient(
  environment.TARGET_SUPABASE_URL,
  environment.TARGET_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const publicClient = createClient(
  environment.TARGET_SUPABASE_URL,
  environment.TARGET_SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  },
);

const email = `gate3-${randomUUID()}@example.invalid`;
const password = `${randomBytes(32).toString("base64url")}Aa1!`;
let createdUserId: string | undefined;

try {
  const { data: created, error: createError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (createError) throw new Error(`AUTH_CREATE_FAILED:${createError.code}`);
  createdUserId = created.user.id;

  const { data: signedIn, error: signInError } =
    await publicClient.auth.signInWithPassword({ email, password });
  if (signInError || signedIn.user.id !== createdUserId) {
    throw new Error(
      `AUTH_LOGIN_FAILED:${signInError?.code ?? "USER_MISMATCH"}`,
    );
  }
  await publicClient.auth.signOut({ scope: "local" });
} finally {
  if (createdUserId) {
    const { error } = await adminClient.auth.admin.deleteUser(
      createdUserId,
      false,
    );
    if (error) throw new Error(`AUTH_CLEANUP_FAILED:${error.code}`);
  }
}

process.stdout.write(
  "Restore-target Auth create/login/cleanup smoke passed.\n",
);
