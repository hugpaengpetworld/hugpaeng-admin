import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.url(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export function readPublicEnv(
  source: NodeJS.ProcessEnv = process.env,
): PublicEnv {
  return publicEnvSchema.parse(source);
}
