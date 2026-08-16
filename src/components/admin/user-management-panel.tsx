"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import {
  manageTenantMembershipAction,
  revokeTenantMembershipAction,
} from "@/app/admin/users/actions";
import {
  PermissionChecklist,
  type PermissionChecklistOption,
} from "@/components/admin/permission-checklist";
import { Icon } from "@/components/ui/icon";
import {
  clinicRoles,
  roleLabels,
  type ClinicRole,
  type TenantPermission,
} from "@/domain/auth/permissions";

type MembershipStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "REVOKED";

interface ManagedTenantUser {
  readonly membershipId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly role: ClinicRole;
  readonly status: MembershipStatus;
  readonly allowedPermissions: readonly TenantPermission[];
}

const statusLabels: Readonly<Record<MembershipStatus, string>> = {
  INVITED: "ส่งคำเชิญแล้ว",
  ACTIVE: "ใช้งาน",
  SUSPENDED: "ระงับชั่วคราว",
  REVOKED: "เพิกถอนแล้ว",
};

const statusClasses: Readonly<Record<MembershipStatus, string>> = {
  INVITED: "bg-amber-100 text-amber-900",
  ACTIVE: "bg-emerald-100 text-emerald-900",
  SUSPENDED: "bg-orange-100 text-orange-900",
  REVOKED: "bg-slate-200 text-slate-700",
};

export function UserManagementPanel({
  actorUserId,
  actorRole,
  users,
  permissionOptions,
}: {
  readonly actorUserId: string;
  readonly actorRole: "OWNER" | "ADMIN";
  readonly users: readonly ManagedTenantUser[];
  readonly permissionOptions: readonly PermissionChecklistOption[];
}) {
  const [editing, setEditing] = useState<ManagedTenantUser | null>(null);
  const [revoking, setRevoking] = useState<ManagedTenantUser | null>(null);

  if (users.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-emerald-900/20 bg-white p-8 text-center text-slate-600">
        ยังไม่มีพนักงานในคลินิก
      </div>
    );
  }

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {users.map((user) => {
          const isSelf = user.userId === actorUserId;
          const protectedOwner = actorRole === "ADMIN" && user.role === "OWNER";
          const canManage = !isSelf && !protectedOwner;
          return (
            <article
              key={user.membershipId}
              className="relative min-h-40 rounded-2xl border border-emerald-900/10 bg-white p-5 pr-28 shadow-sm"
            >
              {canManage && (
                <div className="absolute top-3 right-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(user)}
                    aria-label={`แก้ไข ${user.displayName}`}
                    title={`แก้ไข ${user.displayName}`}
                    className="inline-flex size-11 items-center justify-center rounded-xl border border-emerald-900/15 text-[#123c2f] transition hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123c2f]"
                  >
                    <Icon name="edit" className="size-5" />
                  </button>
                  {user.status !== "REVOKED" && (
                    <button
                      type="button"
                      onClick={() => setRevoking(user)}
                      aria-label={`ลบ ${user.displayName} ออกจากคลินิก`}
                      title={`ลบ ${user.displayName} ออกจากคลินิก`}
                      className="inline-flex size-11 items-center justify-center rounded-xl border border-red-200 text-red-700 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                    >
                      <Icon name="trash" className="size-5" />
                    </button>
                  )}
                </div>
              )}
              <h2 className="text-lg font-bold text-[#123c2f]">
                {user.displayName}
              </h2>
              <p className="mt-3 text-sm font-semibold">
                {roleLabels[user.role]}
              </p>
              <span
                className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusClasses[user.status]}`}
              >
                {statusLabels[user.status]}
              </span>
            </article>
          );
        })}
      </section>

      {editing && (
        <EditUserDialog
          key={editing.membershipId}
          user={editing}
          actorRole={actorRole}
          permissionOptions={permissionOptions}
          onClose={() => setEditing(null)}
        />
      )}
      {revoking && (
        <RevokeUserDialog user={revoking} onClose={() => setRevoking(null)} />
      )}
    </>
  );
}

function EditUserDialog({
  user,
  actorRole,
  permissionOptions,
  onClose,
}: {
  readonly user: ManagedTenantUser;
  readonly actorRole: "OWNER" | "ADMIN";
  readonly permissionOptions: readonly PermissionChecklistOption[];
  readonly onClose: () => void;
}) {
  const [role, setRole] = useState<ClinicRole>(user.role);
  const editablePermissions = role !== "OWNER" && role !== "ADMIN";
  return (
    <DialogShell title={`แก้ไขข้อมูล · ${user.displayName}`} onClose={onClose}>
      <form action={manageTenantMembershipAction} className="grid gap-4">
        <input type="hidden" name="membershipId" value={user.membershipId} />
        <label className="text-sm font-semibold">
          ชื่อแสดง
          <input
            name="displayName"
            required
            maxLength={150}
            defaultValue={user.displayName}
            className="form-input mt-1.5"
          />
        </label>
        <label className="text-sm font-semibold">
          อีเมล
          <input
            value={user.email ?? "ไม่พบอีเมล"}
            readOnly
            className="form-input mt-1.5 bg-slate-100 text-slate-600"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            บทบาท
            <select
              name="role"
              value={role}
              onChange={(event) => setRole(event.target.value as ClinicRole)}
              className="form-input mt-1.5"
            >
              {clinicRoles
                .filter(
                  (candidate) => actorRole === "OWNER" || candidate !== "OWNER",
                )
                .map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {roleLabels[candidate]}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            สถานะการใช้งาน
            <select
              name="status"
              defaultValue={user.status === "INVITED" ? "ACTIVE" : user.status}
              className="form-input mt-1.5"
            >
              <option value="ACTIVE">ใช้งาน</option>
              <option value="SUSPENDED">ระงับชั่วคราว</option>
              <option value="REVOKED">เพิกถอน</option>
            </select>
          </label>
        </div>
        {editablePermissions ? (
          <PermissionChecklist
            options={permissionOptions}
            selected={user.allowedPermissions}
          />
        ) : (
          <p className="rounded-xl bg-emerald-50 p-3 text-sm text-[#123c2f]">
            OWNER และ ADMIN ได้รับสิทธิ์ทั้งหมดโดยอัตโนมัติ
          </p>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl border border-emerald-900/20 px-5 font-bold"
          >
            ยกเลิก
          </button>
          <SubmitButton label="บันทึกข้อมูลพนักงาน" />
        </div>
      </form>
    </DialogShell>
  );
}

function RevokeUserDialog({
  user,
  onClose,
}: {
  readonly user: ManagedTenantUser;
  readonly onClose: () => void;
}) {
  return (
    <DialogShell title="ยืนยันการลบผู้ใช้งาน" onClose={onClose} compact>
      <p className="text-sm leading-6 text-slate-700">
        ต้องการลบ <strong>{user.displayName}</strong> ออกจากคลินิกหรือไม่?
        ผู้ใช้นี้จะเข้าสู่สถานะเพิกถอนและเข้าใช้งานคลินิกไม่ได้ แต่ประวัติการจอง
        การเงิน และ Audit จะยังคงอยู่
      </p>
      <form
        action={revokeTenantMembershipAction}
        className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"
      >
        <input type="hidden" name="membershipId" value={user.membershipId} />
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-xl border border-emerald-900/20 px-5 font-bold"
        >
          ยกเลิก
        </button>
        <SubmitButton label="ยืนยันการลบ" destructive />
      </form>
    </DialogShell>
  );
}

function DialogShell({
  title,
  children,
  onClose,
  compact = false,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly compact?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-dialog-title"
        className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6 ${compact ? "max-w-lg" : "max-w-4xl"}`}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 id="employee-dialog-title" className="text-xl font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#123c2f]"
          >
            <Icon name="close" className="size-5" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function SubmitButton({
  label,
  destructive = false,
}: {
  readonly label: string;
  readonly destructive?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`min-h-11 rounded-xl px-5 font-bold text-white disabled:cursor-wait disabled:opacity-60 ${destructive ? "bg-red-700" : "bg-[#123c2f]"}`}
    >
      {pending ? "กำลังบันทึก..." : label}
    </button>
  );
}
