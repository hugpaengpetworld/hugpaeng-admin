import { existsSync } from "node:fs";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const argumentsSchema = z.object({
  email: z.email(),
  displayName: z.string().min(1).max(150),
});

const environmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DEFAULT_TENANT_SLUG: z.string().min(1).default("baan-mhor-poy"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
});

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const input = argumentsSchema.parse({
    email: valueAfter("--email") ?? process.env.INITIAL_OWNER_EMAIL,
    displayName: valueAfter("--name") ?? "เจ้าของคลินิก",
  });
  const environment = environmentSchema.parse(process.env);
  const supabase = createClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );

  const findUserByEmail = async () => {
    let page = 1;
    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw error;
      const user = data.users.find(
        (candidate) =>
          candidate.email?.toLowerCase() === input.email.toLowerCase(),
      );
      if (user) return user;
      if (data.users.length < 200) return undefined;
      page += 1;
    }
  };

  const existingUser = await findUserByEmail();
  let userId = existingUser?.id;
  if (!userId) {
    const { data: invitation, error: invitationError } =
      await supabase.auth.admin.inviteUserByEmail(input.email, {
        redirectTo: `${environment.NEXT_PUBLIC_APP_URL}/auth/callback`,
        data: { display_name: input.displayName },
      });
    if (invitationError) throw invitationError;
    userId = invitation.user.id;
  }

  const { error: bootstrapError } = await supabase.rpc(
    "bootstrap_first_tenant_owner",
    {
      p_tenant_slug: environment.DEFAULT_TENANT_SLUG,
      p_user_id: userId,
      p_display_name: input.displayName,
    },
  );
  if (bootstrapError) throw bootstrapError;

  process.stdout.write(
    existingUser
      ? "ตรวจสอบ OWNER, tenant membership และ audit trail แล้ว\n"
      : "ส่งคำเชิญ OWNER และสร้าง tenant membership พร้อม audit trail แล้ว\n",
  );
}

await main();
