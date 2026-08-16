import type { ReactNode } from "react";
import Link from "next/link";

import { inviteTenantUserAction } from "@/app/admin/users/actions";
import { AdminSettingsNavigation } from "@/components/admin/admin-settings-navigation";
import { PermissionChecklist } from "@/components/admin/permission-checklist";
import { UserManagementPanel } from "@/components/admin/user-management-panel";
import { Icon } from "@/components/ui/icon";
import {
  requireTenantContext,
  requireUserManager,
} from "@/data/auth/tenant-context";
import {
  listPermissionOptions,
  listTenantUsers,
} from "@/data/users/tenant-users";
import { clinicRoles, roleLabels } from "@/domain/auth/permissions";

type UsersView = "invite" | "manage";

export default async function UsersPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    success?: string;
    error?: string;
    view?: string;
  }>;
}) {
  const context = await requireTenantContext();
  requireUserManager(context);
  const query = await searchParams;
  const view: UsersView = query.view === "manage" ? "manage" : "invite";
  const permissionOptions = await listPermissionOptions();
  const users = view === "manage" ? await listTenantUsers() : [];
  const actorRole = context.role === "OWNER" ? "OWNER" : "ADMIN";

  return (
    <div className="min-h-screen bg-[#f5f8f6] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <AdminSettingsNavigation active="users" />
          <p className="mt-6 text-sm font-semibold text-[#2d6a50]">
            สำหรับ OWNER และ ADMIN
          </p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
            <ViewLink href="/admin/users" active={view === "invite"}>
              <Icon name="users" className="size-5" />
              เพิ่มผู้ใช้งาน
            </ViewLink>
            <ViewLink
              href="/admin/users?view=manage"
              active={view === "manage"}
            >
              <Icon name="employee" className="size-5" />
              จัดการพนักงาน
            </ViewLink>
          </div>
          <p className="mt-3 text-sm text-slate-600">
            {view === "invite"
              ? "เชิญผู้ใช้งานใหม่และกำหนดสิทธิ์ตามหน้าที่ตั้งแต่เริ่มต้น"
              : "ดูรายชื่อ แก้ไขบทบาท สถานะ และสิทธิ์รายบุคคลของพนักงาน"}
          </p>
        </header>

        {query.success && (
          <div
            role="status"
            className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm"
          >
            {successMessage(query.success)}
          </div>
        )}
        {query.error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          >
            {userError(query.error)}
          </div>
        )}

        {view === "invite" ? (
          <section className="rounded-2xl border border-emerald-900/10 bg-white p-5 sm:p-6">
            <h1 className="text-2xl font-bold">เชิญผู้ใช้งาน</h1>
            <form
              action={inviteTenantUserAction}
              className="mt-5 grid gap-4 sm:grid-cols-2"
            >
              <label className="text-sm font-semibold">
                อีเมล
                <input
                  name="email"
                  type="email"
                  required
                  className="form-input mt-1.5"
                />
              </label>
              <label className="text-sm font-semibold">
                ชื่อแสดง
                <input
                  name="displayName"
                  required
                  maxLength={150}
                  className="form-input mt-1.5"
                />
              </label>
              <label className="text-sm font-semibold">
                บทบาท
                <select
                  name="role"
                  defaultValue="STAFF"
                  className="form-input mt-1.5"
                >
                  {clinicRoles
                    .filter(
                      (role) => context.role === "OWNER" || role !== "OWNER",
                    )
                    .map((role) => (
                      <option key={role} value={role}>
                        {roleLabels[role]}
                      </option>
                    ))}
                </select>
              </label>
              <PermissionChecklist options={permissionOptions} />
              <button className="min-h-11 self-end rounded-xl bg-[#123c2f] px-4 font-bold text-white sm:col-span-2">
                ส่งคำเชิญ
              </button>
            </form>
          </section>
        ) : (
          <section aria-labelledby="manage-users-heading" className="space-y-4">
            <div>
              <h1 id="manage-users-heading" className="text-2xl font-bold">
                จัดการพนักงาน
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                การลบจะเพิกถอนสิทธิ์เข้าคลินิกโดยเก็บประวัติการทำงานและ Audit
                ไว้ครบถ้วน
              </p>
            </div>
            <UserManagementPanel
              actorUserId={context.userId}
              actorRole={actorRole}
              users={users}
              permissionOptions={permissionOptions}
            />
          </section>
        )}
      </div>
    </div>
  );
}

function ViewLink({
  href,
  active,
  children,
}: {
  readonly href: string;
  readonly active: boolean;
  readonly children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-5 font-bold shadow-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123c2f] ${
        active
          ? "border-[#123c2f] bg-[#123c2f] text-white"
          : "border-emerald-900/15 bg-white text-[#123c2f] hover:bg-emerald-50"
      }`}
    >
      {children}
    </Link>
  );
}

function successMessage(code: string): string {
  const messages: Readonly<Record<string, string>> = {
    invited: "ส่งคำเชิญผู้ใช้งานเรียบร้อยแล้ว",
    updated: "บันทึกข้อมูลและสิทธิ์พนักงานเรียบร้อยแล้ว",
    revoked: "ลบผู้ใช้งานออกจากคลินิกเรียบร้อยแล้ว โดยเก็บประวัติไว้",
  };
  return messages[code] ?? "บันทึกผู้ใช้งานเรียบร้อยแล้ว";
}

function userError(code: string): string {
  const messages: Readonly<Record<string, string>> = {
    VALIDATION_ERROR: "ข้อมูลไม่ถูกต้อง",
    INVALID_DISPLAY_NAME: "ชื่อแสดงต้องมีความยาว 1–150 ตัวอักษร",
    NOT_FOUND: "ไม่พบผู้ใช้งานที่ต้องการจัดการ",
    USER_ALREADY_MEMBER: "อีเมลนี้เป็นสมาชิก tenant แล้ว",
    INVITE_FAILED: "ส่งคำเชิญไม่สำเร็จ กรุณาตรวจ Auth URL/SMTP และลองใหม่",
    AUTH_USER_LOOKUP_FAILED:
      "ตรวจสอบบัญชีผู้ใช้เดิมไม่สำเร็จ จึงยังไม่ได้ส่งคำเชิญ กรุณาลองใหม่อีกครั้ง",
    AUDIT_FAILED:
      "สร้างสมาชิกแล้วแต่บันทึก Audit ไม่สำเร็จ กรุณาตรวจสอบก่อนลองซ้ำ",
    CANNOT_CHANGE_OWN_MEMBERSHIP:
      "ไม่อนุญาตให้เปลี่ยนสิทธิ์ของบัญชีตนเองจากหน้านี้",
    LAST_OWNER_REQUIRED: "ต้องมี OWNER ที่ใช้งานอย่างน้อยหนึ่งบัญชี",
    FORBIDDEN: "ไม่มีสิทธิ์ดำเนินการ",
    ADMIN_CANNOT_MANAGE_OWNER:
      "ADMIN ไม่สามารถเพิ่ม เปลี่ยนสิทธิ์ ระงับ หรือลบบัญชี OWNER ได้",
    UNKNOWN_PERMISSION:
      "พบสิทธิ์ที่ระบบไม่รู้จัก กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง",
    UNKNOWN: "ดำเนินการไม่สำเร็จ",
  };
  return messages[code] ?? messages.UNKNOWN!;
}
