import { type NextRequest } from "next/server";

import { refreshSupabaseSession } from "@/lib/supabase/proxy";

// OpenNext for Cloudflare does not yet support the Node.js Proxy runtime used
// by Next.js 16. Keep this narrow Edge Middleware solely for cookie refresh;
// authorization remains enforced in the server data layer, RPCs, and RLS.
export async function middleware(request: NextRequest) {
  return refreshSupabaseSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
