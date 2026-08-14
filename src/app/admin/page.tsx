import Link from "next/link";

import { logoutAction } from "@/app/(auth)/actions";
import { Icon, type IconName } from "@/components/ui/icon";
import { requireTenantContext } from "@/data/auth/tenant-context";
import { roleLabels, type TenantPermission } from "@/domain/auth/permissions";
import { getSignedLogoUrl } from "@/data/settings/logo";

export default async function AdminHomePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ password_updated?: string }>;
}) {
  const context = await requireTenantContext();
  const logoUrl = await getSignedLogoUrl(context.logoStoragePath);
  const query = await searchParams;
  const tenantInitial =
    context.thaiName.trim().slice(0, 1) ||
    context.englishName.trim().slice(0, 1).toUpperCase() ||
    "S";

  return (
    <div className="relative min-h-[100svh] overflow-hidden bg-[#fbf1df] text-[#173f32]">
      <ResponsiveBackground />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#fffaf1]/20 via-transparent to-[#fff8ec]/15"
      />

      <header className="relative z-20 border-b border-[#76573b]/15 bg-[#fffaf1]/90 shadow-[0_1px_14px_rgb(62_48_34/0.06)] backdrop-blur-md">
        <div className="mx-auto flex min-h-20 max-w-[1480px] items-center px-4 sm:px-6 lg:px-10">
          <Link
            href="/admin"
            aria-label={`หน้าหลักระบบหลังบ้าน ${context.thaiName}`}
            className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#2d6a50]"
          >
            {logoUrl ? (
              // Signed Supabase URLs are short-lived and tenant-authorized.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={`โลโก้ ${context.thaiName}`}
                className="size-12 shrink-0 rounded-xl border border-[#76573b]/15 bg-white object-contain p-1"
              />
            ) : (
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#164a37] text-sm font-black text-white">
                {tenantInitial}
              </span>
            )}
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-lg font-black tracking-wide text-[#23523e]">
                {context.thaiName}
              </span>
              <span className="block truncate text-xs font-bold tracking-[0.12em] text-[#d17a14]">
                {context.englishName}
              </span>
            </span>
          </Link>
        </div>

        <div className="border-t border-[#76573b]/10">
          <div className="mx-auto flex min-h-16 max-w-[1480px] items-center gap-3 px-4 sm:px-6 lg:px-10">
            <nav
              aria-label="เมนูระบบหลังบ้าน"
              className="hidden flex-1 items-center justify-center gap-1 xl:flex"
            >
              <TopNavigation permissions={context.permissions} />
            </nav>

            <details className="group relative xl:hidden">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-[#76573b]/15 bg-white/70 px-3 text-sm font-bold text-[#23523e] hover:bg-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#2d6a50]">
                <Icon name="menu" className="size-5" />
                <span className="hidden sm:inline">เมนูระบบ</span>
              </summary>
              <div className="absolute top-[calc(100%+0.65rem)] right-0 w-[min(88vw,340px)] rounded-2xl border border-[#76573b]/15 bg-[#fffaf1] p-3 shadow-2xl">
                <div className="grid gap-1">
                  <MobileNavigation permissions={context.permissions} />
                </div>
              </div>
            </details>

            <details className="group relative ml-auto">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-full border border-[#76573b]/15 bg-white/65 py-1.5 pr-3 pl-2 hover:bg-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#2d6a50]">
                <span className="grid size-8 place-items-center rounded-full bg-[#23523e] text-xs font-black text-white">
                  {context.displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden text-left leading-tight sm:block">
                  <span className="block max-w-32 truncate text-sm font-bold">
                    {context.displayName}
                  </span>
                  <span className="block text-[11px] text-[#6b5b4b]">
                    {roleLabels[context.role]}
                  </span>
                </span>
              </summary>
              <div className="absolute top-[calc(100%+0.65rem)] right-0 w-64 rounded-2xl border border-[#76573b]/15 bg-[#fffaf1] p-3 shadow-2xl">
                <AccountMenu />
              </div>
            </details>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex min-h-[calc(100svh-144px)] max-w-[1480px] flex-col px-4 pt-7 pb-[44svh] sm:px-6 sm:pt-10 sm:pb-[40svh] lg:px-10 lg:pt-[8vh] lg:pb-16">
        {query.password_updated === "1" && (
          <div
            role="status"
            className="mb-5 max-w-xl rounded-xl border border-emerald-300 bg-emerald-50/95 p-4 text-sm text-emerald-900 shadow-sm"
          >
            ตั้งรหัสผ่านเรียบร้อยแล้ว
          </div>
        )}

        <section className="max-w-6xl rounded-[1.75rem] border border-white/70 bg-[#fff8e9]/78 p-5 shadow-[0_18px_55px_rgb(83_60_35/0.14)] backdrop-blur-md sm:p-7 lg:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#e2c99f] bg-[#fffaf1]/90 px-3 py-1.5 text-xs font-bold text-[#23523e] shadow-sm">
            <Icon name="sparkle" className="size-4 text-[#d17a14]" />
            ระบบบริหารจัดการธุรกิจ
          </div>
          <p className="mt-5 text-sm font-bold text-[#2d6a50] sm:text-base">
            สวัสดี {context.displayName} · {roleLabels[context.role]}
          </p>
          <h1 className="mt-2 text-4xl leading-[1.12] font-black text-[#164a37] sm:text-5xl xl:text-[clamp(3rem,4vw,4rem)] xl:whitespace-nowrap">
            ทุกระบบของธุรกิจสัตว์เลี้ยงในที่เดียว
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#5e5145] sm:text-base sm:leading-8">
            เลือกพื้นที่ทำงานของคุณ
            ระบบจะแสดงข้อมูลและเครื่องมือตามบทบาทที่ได้รับอนุญาต
            โดยไม่เปิดเผยหน้าหลังบ้านให้ผู้ใช้งานเว็บไซต์ทั่วไป
          </p>
        </section>
      </main>
    </div>
  );
}

function ResponsiveBackground() {
  return (
    <picture className="pointer-events-none absolute inset-0">
      <source
        media="(max-width: 639px)"
        srcSet="/images/admin/bghome-smartphone.png"
      />
      <source
        media="(max-width: 1023px)"
        srcSet="/images/admin/bghome-teblet.png"
      />
      {/* The responsive art is intentionally selected by picture sources. */}
      <img
        src="/images/admin/bghome-pc.png"
        alt=""
        className="size-full object-cover object-center"
      />
    </picture>
  );
}

function TopNavigation({
  permissions,
}: {
  readonly permissions: readonly TenantPermission[];
}) {
  const canOpenBookings = permissions.includes("BOOKINGS_READ");
  const canOpenSettings = permissions.includes("SETTINGS_MANAGE");
  return (
    <>
      <TopItem icon="pos" label="ระบบ POS" future />
      <TopItem
        icon="calendar"
        label="ฝากเลี้ยง–ทำหมัน"
        href={canOpenBookings ? "/admin/bookings" : undefined}
      />
      <TopItem icon="employee" label="สำหรับพนักงาน" future />
      <TopItem icon="stethoscope" label="สำหรับสัตวแพทย์" future />
      {canOpenSettings && (
        <TopItem
          icon="settings"
          label="การตั้งค่าสำหรับผู้ดูแลระบบ"
          href="/admin/settings"
        />
      )}
    </>
  );
}

function MobileNavigation({
  permissions,
}: {
  readonly permissions: readonly TenantPermission[];
}) {
  const canOpenBookings = permissions.includes("BOOKINGS_READ");
  const canOpenSettings = permissions.includes("SETTINGS_MANAGE");
  return (
    <>
      <MobileItem icon="pos" label="ระบบ POS" future />
      <MobileItem
        icon="calendar"
        label="ฝากเลี้ยง–ทำหมัน"
        href={canOpenBookings ? "/admin/bookings" : undefined}
      />
      <MobileItem icon="employee" label="สำหรับพนักงาน" future />
      <MobileItem icon="stethoscope" label="สำหรับสัตวแพทย์" future />
      {canOpenSettings && (
        <MobileItem
          icon="settings"
          label="การตั้งค่าสำหรับผู้ดูแลระบบ"
          href="/admin/settings"
        />
      )}
    </>
  );
}

function TopItem({ icon, label, href, future = false }: NavigationItemProps) {
  const content = (
    <>
      <Icon name={icon} className="size-4" />
      {label}
      {future && (
        <span className="rounded-full bg-[#f4dfbd] px-1.5 py-0.5 text-[9px] font-bold text-[#8a581c]">
          เร็ว ๆ นี้
        </span>
      )}
    </>
  );

  return href ? (
    <Link
      href={href}
      className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-[#23523e] transition hover:bg-white/70 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#2d6a50]"
    >
      {content}
    </Link>
  ) : (
    <span
      aria-disabled="true"
      className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[#6d6257]"
    >
      {content}
    </span>
  );
}

function MobileItem({
  icon,
  label,
  href,
  future = false,
}: NavigationItemProps) {
  const content = (
    <>
      <Icon name={icon} className="size-5 shrink-0" />
      <span className="flex-1">{label}</span>
      {future && (
        <span className="rounded-full bg-[#f4dfbd] px-2 py-1 text-[10px] font-bold text-[#8a581c]">
          เร็ว ๆ นี้
        </span>
      )}
    </>
  );

  return href ? (
    <Link
      href={href}
      className="flex min-h-12 items-center gap-3 rounded-xl bg-[#e7f1e8] px-3 text-sm font-bold text-[#23523e] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#2d6a50]"
    >
      {content}
    </Link>
  ) : (
    <span
      aria-disabled="true"
      className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#6d6257]"
    >
      {content}
    </span>
  );
}

function AccountMenu() {
  return (
    <div>
      <form action={logoutAction}>
        <button className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-red-800 hover:bg-red-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-red-700">
          <Icon name="logout" className="size-5" />
          ออกจากระบบ
        </button>
      </form>
    </div>
  );
}

interface NavigationItemProps {
  readonly icon: IconName;
  readonly label: string;
  readonly href?: string;
  readonly future?: boolean;
}
