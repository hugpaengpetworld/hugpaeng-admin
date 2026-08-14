import Link from "next/link";

import { Icon, type IconName } from "@/components/ui/icon";

interface AdminSettingsNavigationProps {
  readonly active: "settings" | "users";
}

const items: readonly {
  readonly href: string;
  readonly label: string;
  readonly icon: IconName;
  readonly key: "home" | "users" | "settings";
}[] = [
  {
    href: "/admin",
    label: "กลับหน้าหลักระบบหลังบ้าน",
    icon: "chevron-left",
    key: "home",
  },
  {
    href: "/admin/users",
    label: "เพิ่มผู้ใช้งาน",
    icon: "users",
    key: "users",
  },
  {
    href: "/admin/settings",
    label: "การตั้งค่าสำหรับผู้ดูแลระบบ",
    icon: "settings",
    key: "settings",
  },
];

export function AdminSettingsNavigation({
  active,
}: AdminSettingsNavigationProps) {
  return (
    <nav
      aria-label="เมนูการตั้งค่าสำหรับผู้ดูแลระบบ"
      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
    >
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold shadow-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123c2f] ${
              isActive
                ? "border-[#123c2f] bg-[#123c2f] text-white"
                : "border-emerald-900/15 bg-white text-[#123c2f] hover:bg-emerald-50"
            }`}
          >
            <Icon name={item.icon} className="size-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
