import {
  inviteTenantUserAction,
  manageTenantMembershipAction,
} from "@/app/admin/users/actions";
import { AdminSettingsNavigation } from "@/components/admin/admin-settings-navigation";
import { requireOwner, requireTenantContext } from "@/data/auth/tenant-context";
import { listTenantUsers } from "@/data/users/tenant-users";

const roleLabels = {
  OWNER: "เจ้าของคลินิก",
  DOCTOR: "สัตวแพทย์",
  STAFF: "พนักงาน",
} as const;
const statusLabels = {
  INVITED: "ส่งคำเชิญแล้ว",
  ACTIVE: "ใช้งาน",
  SUSPENDED: "ระงับชั่วคราว",
  REVOKED: "เพิกถอน",
} as const;

export default async function UsersPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const context = await requireTenantContext();
  requireOwner(context);
  const [query, users] = await Promise.all([searchParams, listTenantUsers()]);
  return (
    <div className="min-h-screen bg-[#f5f8f6] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <AdminSettingsNavigation active="users" />
          <p className="mt-6 text-sm font-semibold text-[#2d6a50]">
            เจ้าของคลินิกเท่านั้น
          </p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
            เพิ่มผู้ใช้งาน
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            เชิญผ่าน Supabase Auth และบังคับ role/tenant ที่ server และ RLS
          </p>
        </header>
        {query.success && (
          <div
            role="status"
            className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm"
          >
            บันทึกผู้ใช้งานเรียบร้อยแล้ว
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
        <section className="rounded-2xl border border-emerald-900/10 bg-white p-5">
          <h2 className="text-lg font-bold">เชิญผู้ใช้งาน</h2>
          <form
            action={inviteTenantUserAction}
            className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
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
                <option value="STAFF">พนักงาน</option>
                <option value="DOCTOR">สัตวแพทย์</option>
                <option value="OWNER">เจ้าของคลินิก</option>
              </select>
            </label>
            <button className="min-h-11 self-end rounded-xl bg-[#123c2f] px-4 font-bold text-white">
              ส่งคำเชิญ
            </button>
          </form>
        </section>
        <section className="space-y-3">
          {users.map((user) => (
            <article
              key={user.membershipId}
              className="rounded-2xl border border-emerald-900/10 bg-white p-5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-bold">{user.displayName}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {user.email ?? "ไม่พบอีเมล"}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#2d6a50]">
                    {roleLabels[user.role]} · {statusLabels[user.status]}
                  </p>
                </div>
                {user.userId !== context.userId && (
                  <form
                    action={manageTenantMembershipAction}
                    className="grid gap-2 sm:grid-cols-[150px_170px_auto]"
                  >
                    <input
                      type="hidden"
                      name="membershipId"
                      value={user.membershipId}
                    />
                    <select
                      name="role"
                      defaultValue={user.role}
                      aria-label={`บทบาทของ ${user.displayName}`}
                      className="form-input"
                    >
                      <option value="STAFF">พนักงาน</option>
                      <option value="DOCTOR">สัตวแพทย์</option>
                      <option value="OWNER">เจ้าของคลินิก</option>
                    </select>
                    <select
                      name="status"
                      defaultValue={
                        user.status === "INVITED" ? "ACTIVE" : user.status
                      }
                      aria-label={`สถานะของ ${user.displayName}`}
                      className="form-input"
                    >
                      <option value="ACTIVE">ใช้งาน</option>
                      <option value="SUSPENDED">ระงับชั่วคราว</option>
                      <option value="REVOKED">เพิกถอน</option>
                    </select>
                    <button className="min-h-11 rounded-xl border border-[#123c2f] px-4 font-bold">
                      บันทึก
                    </button>
                  </form>
                )}
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}

function userError(code: string): string {
  const messages: Readonly<Record<string, string>> = {
    VALIDATION_ERROR: "ข้อมูลไม่ถูกต้อง",
    USER_ALREADY_MEMBER: "อีเมลนี้เป็นสมาชิก tenant แล้ว",
    INVITE_FAILED: "ส่งคำเชิญไม่สำเร็จ กรุณาตรวจ Auth URL/SMTP และลองใหม่",
    AUDIT_FAILED:
      "สร้างสมาชิกแล้วแต่บันทึก Audit ไม่สำเร็จ กรุณาตรวจสอบก่อนลองซ้ำ",
    CANNOT_CHANGE_OWN_MEMBERSHIP:
      "ไม่อนุญาตให้เปลี่ยนสิทธิ์ของบัญชีตนเองจากหน้านี้",
    LAST_OWNER_REQUIRED: "ต้องมี OWNER ที่ใช้งานอย่างน้อยหนึ่งบัญชี",
    FORBIDDEN: "ไม่มีสิทธิ์ดำเนินการ",
    UNKNOWN: "ดำเนินการไม่สำเร็จ",
  };
  return messages[code] ?? messages.UNKNOWN!;
}
