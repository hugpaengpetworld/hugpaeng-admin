"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { logoutAction } from "@/app/(auth)/actions";
import { ClinicMark } from "@/components/branding/clinic-mark";
import { Icon, type IconName } from "@/components/ui/icon";
import { roleLabels, type TenantPermission } from "@/domain/auth/permissions";
import type { ClinicRole } from "@/data/auth/tenant-context";

interface NavItem {
  readonly label: string;
  readonly href?: string;
  readonly icon: IconName;
  readonly ownerOnly?: boolean;
  readonly permission?: TenantPermission;
  readonly future?: string;
}

const navigation: readonly NavItem[] = [
  { label: "HOME", href: "/admin", icon: "dashboard" },
  {
    label: "ทะเบียนลูกค้า–สัตว์เลี้ยง",
    href: "/admin/customers",
    icon: "users",
    permission: "CUSTOMERS_READ",
  },
  {
    label: "รายการจองฝากเลี้ยง",
    href: "/admin/bookings",
    icon: "calendar",
    permission: "BOOKINGS_READ",
  },
  {
    label: "เช็กอิน–เช็กเอาต์",
    href: "/admin/operations",
    icon: "home",
    permission: "BOOKINGS_READ",
  },
  {
    label: "ห้องพักแมว",
    href: "/admin/rooms/cats",
    icon: "cat",
    permission: "BOOKINGS_READ",
  },
  {
    label: "ห้องพักสุนัข",
    href: "/admin/rooms/dogs",
    icon: "dog",
    permission: "BOOKINGS_READ",
  },
  {
    label: "ปฏิทินคิวทำหมัน",
    href: "/admin/sterilization",
    icon: "calendar",
    permission: "STERILIZATION_READ",
  },
  {
    label: "การเงิน",
    href: "/admin/finance",
    icon: "finance",
    permission: "PAYMENTS_COLLECT",
  },
];

export function AdminShell({
  children,
  displayName,
  role,
  permissions,
  thaiName,
  englishName,
  logoUrl,
}: {
  readonly children: React.ReactNode;
  readonly displayName: string;
  readonly role: ClinicRole;
  readonly permissions: readonly TenantPermission[];
  readonly thaiName: string;
  readonly englishName: string;
  readonly logoUrl: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const visibleNavigation = navigation.filter(
    (item) =>
      (!item.ownerOnly || role === "OWNER") &&
      (!item.permission || permissions.includes(item.permission)),
  );

  if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/settings") ||
    pathname.startsWith("/admin/users")
  ) {
    return <div className="min-h-screen text-[#173f32]">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-[#f5f8f6] text-[#173f32]">
      {open && (
        <button
          type="button"
          aria-label="ปิดเมนู"
          className="fixed inset-0 z-30 bg-black/45 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[286px] flex-col bg-[#123c2f] shadow-xl transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
          <ClinicMark logoUrl={logoUrl} thaiName={thaiName} />
          <button
            type="button"
            aria-label="ปิดเมนู"
            className="grid size-11 place-items-center rounded-lg text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white lg:hidden"
            onClick={() => setOpen(false)}
          >
            <Icon name="close" className="size-6" />
          </button>
        </div>

        <nav
          aria-label="เมนูหลัก"
          className="flex-1 space-y-1 overflow-y-auto px-3 py-5"
        >
          {visibleNavigation.map((item) => {
            const active = item.href
              ? item.href === "/admin"
                ? pathname === item.href
                : pathname.startsWith(item.href)
              : false;
            const content = (
              <>
                <Icon name={item.icon} className="size-5 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.future && (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-emerald-100">
                    {item.future}
                  </span>
                )}
              </>
            );
            return item.href ? (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${active ? "bg-[#2d6a50] shadow-inner" : "hover:bg-white/10"}`}
              >
                {content}
              </Link>
            ) : (
              <div
                key={item.label}
                aria-disabled="true"
                className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-emerald-100/60"
              >
                {content}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="mb-3 min-w-0 px-2">
            <p className="truncate text-sm font-semibold text-white">
              {displayName}
            </p>
            <p className="text-xs text-emerald-200">{roleLabels[role]}</p>
          </div>
          <form action={logoutAction}>
            <button className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              <Icon name="logout" className="size-5" />
              ออกจากระบบ
            </button>
          </form>
        </div>
      </aside>

      <div className="lg:pl-[286px]">
        <header className="sticky top-0 z-20 flex min-h-16 items-center gap-4 border-b border-emerald-900/10 bg-[#dcefe4]/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button
            type="button"
            aria-label="เปิดเมนู"
            className="grid size-11 place-items-center rounded-xl text-[#123c2f] hover:bg-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123c2f] lg:hidden"
            onClick={() => setOpen(true)}
          >
            <Icon name="menu" className="size-6" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[#123c2f]">
              {thaiName}
            </p>
            <p className="truncate text-xs text-[#35634f]">{englishName}</p>
          </div>
          <div className="ml-auto hidden text-right sm:block">
            <p className="text-sm font-semibold">{displayName}</p>
            <p className="text-xs text-[#35634f]">{roleLabels[role]}</p>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
