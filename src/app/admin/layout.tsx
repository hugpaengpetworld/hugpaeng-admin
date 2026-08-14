import { AdminShell } from "@/components/admin/admin-shell";
import { requireTenantContext } from "@/data/auth/tenant-context";
import { getSignedLogoUrl } from "@/data/settings/logo";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const context = await requireTenantContext();
  const logoUrl = await getSignedLogoUrl(context.logoStoragePath);
  return (
    <AdminShell
      displayName={context.displayName}
      role={context.role}
      thaiName={context.thaiName}
      englishName={context.englishName}
      logoUrl={logoUrl}
    >
      {children}
    </AdminShell>
  );
}
