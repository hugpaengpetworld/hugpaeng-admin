import Link from "next/link";

import { logoutAction } from "@/app/(auth)/actions";
import { requirePlatformContext } from "@/data/auth/platform-context";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const context = await requirePlatformContext();
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-900">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link href="/platform" className="font-bold">
            BMP Platform Console
          </Link>
          <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-bold text-indigo-200">
            {context.role === "PLATFORM_OWNER"
              ? "Platform Owner"
              : "Support Agent"}
          </span>
          <span className="ml-auto hidden text-sm text-slate-300 sm:block">
            {context.displayName}
          </span>
          <form action={logoutAction}>
            <button className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-bold">
              ออกจากระบบ
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
