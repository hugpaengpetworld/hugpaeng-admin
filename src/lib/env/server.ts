import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  RATE_LIMIT_HASH_SECRET: z.string().min(32),
  APP_TIMEZONE: z.literal("Asia/Bangkok").default("Asia/Bangkok"),
  APP_CURRENCY: z.literal("THB").default("THB"),
  DEFAULT_TENANT_SLUG: z.string().min(1).default("baan-mhor-poy"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function readServerEnv(
  source: NodeJS.ProcessEnv = process.env,
): ServerEnv {
  return serverEnvSchema.parse(source);
}
