import {
  createSupportGrantAction,
  revokeSupportGrantAction,
} from "@/app/platform/actions";
import {
  requirePlatformContext,
  requirePlatformOwner,
} from "@/data/auth/platform-context";
import { getPlatformSupportData } from "@/data/platform/support-access";

const scopeOptions = [
  ["BOOKING_READ", "อ่านข้อมูลการจอง"],
  ["CUSTOMER_READ", "อ่านข้อมูลลูกค้า/สัตว์"],
  ["ROOM_READ", "อ่านสถานะห้อง"],
  ["FINANCE_READ", "อ่านข้อมูลการเงิน"],
  ["STERILIZATION_READ", "อ่านนัดทำหมัน"],
  ["HEALTH_READ", "อ่านข้อมูลสุขภาพจำกัด"],
  ["AUDIT_READ", "อ่าน Audit Log"],
] as const;

export default async function PlatformPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const context = await requirePlatformContext();
  requirePlatformOwner(context);
  const [query, data] = await Promise.all([
    searchParams,
    getPlatformSupportData(),
  ]);
  const tenantNames = new Map(
    data.tenants.map((tenant) => [tenant.id, tenant.thaiName]),
  );
  const agentNames = new Map(
    data.agents.map((agent) => [agent.userId, agent.displayName]),
  );
  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-semibold text-indigo-300">
          Platform foundation
        </p>
        <h1 className="mt-1 text-3xl font-bold">
          ผู้เช่าและ Temporary Support Access
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
          Platform Owner เห็นวงจรชีวิต tenant
          แต่ไม่มีสิทธิ์อ่านข้อมูลคลินิกอัตโนมัติ การเข้าถึงข้อมูลต้องสร้าง
          grant ที่ระบุ tenant, เหตุผล, ticket, scope และเวลาสิ้นสุด
        </p>
      </header>
      {query.success && (
        <div
          role="status"
          className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-4 text-sm"
        >
          บันทึกเรียบร้อยแล้ว
        </div>
      )}
      {query.error && (
        <div
          role="alert"
          className="rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm"
        >
          {platformError(query.error)}
        </div>
      )}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.tenants.map((tenant) => (
          <article
            key={tenant.id}
            className="rounded-2xl border border-white/10 bg-slate-900 p-5"
          >
            <h2 className="font-bold">{tenant.thaiName}</h2>
            <p className="mt-1 text-sm text-slate-400">{tenant.slug}</p>
            <span className="mt-4 inline-flex rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-200">
              {tenant.status}
            </span>
          </article>
        ))}
      </section>
      <section className="rounded-2xl border border-white/10 bg-slate-900 p-6">
        <h2 className="text-xl font-bold">สร้าง Support Access Grant</h2>
        {data.agents.length === 0 ? (
          <p className="mt-3 text-sm text-amber-200">
            ยังไม่มีบัญชี SUPPORT_AGENT ต้องกำหนด platform role ก่อนจึงสร้าง
            grant ได้
          </p>
        ) : (
          <form
            action={createSupportGrantAction}
            className="mt-5 grid gap-4 sm:grid-cols-2"
          >
            <label className="text-sm font-semibold">
              Tenant
              <select
                name="tenantId"
                required
                defaultValue=""
                className="form-input mt-1.5"
              >
                <option value="" disabled>
                  เลือก tenant
                </option>
                {data.tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.thaiName}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold">
              Support Agent
              <select
                name="supportUserId"
                required
                defaultValue=""
                className="form-input mt-1.5"
              >
                <option value="" disabled>
                  เลือกผู้ให้การสนับสนุน
                </option>
                {data.agents.map((agent) => (
                  <option key={agent.userId} value={agent.userId}>
                    {agent.displayName}
                    {agent.email ? ` · ${agent.email}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold">
              Ticket / Reference
              <input
                name="ticketReference"
                required
                maxLength={100}
                className="form-input mt-1.5"
              />
            </label>
            <label className="text-sm font-semibold">
              เริ่มเวลา (เว้นว่าง = เริ่มทันที)
              <input
                name="startLocal"
                type="datetime-local"
                className="form-input mt-1.5"
              />
            </label>
            <label className="text-sm font-semibold">
              ระยะเวลา
              <select
                name="durationHours"
                required
                defaultValue=""
                className="form-input mt-1.5"
              >
                <option value="" disabled>
                  เลือกระยะเวลา
                </option>
                <option value="1">1 ชั่วโมง</option>
                <option value="2">2 ชั่วโมง</option>
                <option value="4">4 ชั่วโมง</option>
                <option value="8">8 ชั่วโมง</option>
                <option value="24">24 ชั่วโมง (สูงสุด)</option>
              </select>
            </label>
            <label className="text-sm font-semibold sm:col-span-2">
              เหตุผล
              <textarea
                name="reason"
                required
                minLength={10}
                maxLength={500}
                rows={3}
                className="form-input mt-1.5"
              />
            </label>
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="font-bold">Scope แบบอ่านอย่างเดียว</legend>
              <p className="text-xs text-slate-400">
                TENANT_OVERVIEW ถูกเพิ่มให้ทุก grant และไม่มี scope
                สำหรับเขียนข้อมูล คืนเงิน จัดการผู้ใช้ หรือ secret
              </p>
              {scopeOptions.map(([value, label]) => (
                <label
                  key={value}
                  className="flex min-h-11 items-center gap-3 text-sm"
                >
                  <input
                    name="scopes"
                    type="checkbox"
                    value={value}
                    className="size-5"
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <button className="min-h-12 rounded-xl bg-indigo-500 px-5 font-bold text-white sm:col-span-2">
              สร้าง grant และบันทึก Audit
            </button>
          </form>
        )}
      </section>
      <section>
        <h2 className="text-xl font-bold">Grant ล่าสุด</h2>
        <div className="mt-4 space-y-3">
          {data.grants.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/20 p-8 text-center text-sm text-slate-400">
              ยังไม่มี Support Access Grant
            </p>
          ) : (
            data.grants.map((grant) => (
              <article
                key={grant.id}
                className="rounded-2xl border border-white/10 bg-slate-900 p-5"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                  <div>
                    <p className="font-bold">
                      {tenantNames.get(grant.tenantId) ?? grant.tenantId}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      {agentNames.get(grant.supportUserId) ??
                        grant.supportUserId}{" "}
                      · Ticket {grant.ticketReference}
                    </p>
                  </div>
                  <span className="h-fit w-fit rounded-full bg-white/10 px-3 py-1 text-xs font-bold">
                    {grant.status}
                  </span>
                </div>
                <p className="mt-3 text-sm">{grant.reason}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {grant.scopes.join(" · ")}
                  <br />
                  {formatBangkokDateTime(grant.startsAt)} →{" "}
                  {formatBangkokDateTime(grant.expiresAt)}
                </p>
                {(grant.status === "ACTIVE" ||
                  grant.status === "SCHEDULED") && (
                  <form
                    action={revokeSupportGrantAction}
                    className="mt-4 flex flex-wrap gap-2"
                  >
                    <input type="hidden" name="grantId" value={grant.id} />
                    <input
                      name="reason"
                      required
                      maxLength={500}
                      placeholder="เหตุผลการเพิกถอน"
                      className="form-input max-w-md"
                    />
                    <button className="min-h-11 rounded-xl border border-red-400 px-4 font-bold text-red-200">
                      เพิกถอนทันที
                    </button>
                  </form>
                )}
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function formatBangkokDateTime(value: string): string {
  return new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}
function platformError(code: string): string {
  const messages: Readonly<Record<string, string>> = {
    VALIDATION_ERROR: "ข้อมูลไม่ถูกต้องหรือยังเลือกไม่ครบ",
    SUPPORT_AGENT_REQUIRED: "ผู้ใช้ที่เลือกไม่มีบทบาท Support Agent",
    INVALID_SUPPORT_WINDOW:
      "ช่วงเวลาต้องสิ้นสุดภายใน 24 ชั่วโมงและยังไม่หมดอายุ",
    INVALID_SUPPORT_SCOPE: "Scope ไม่อยู่ในรายการที่อนุญาต",
    SUPPORT_GRANT_NOT_ACTIVE: "Grant นี้หมดอายุหรือถูกเพิกถอนแล้ว",
    FORBIDDEN: "ไม่มีสิทธิ์ดำเนินการ",
    UNKNOWN: "ดำเนินการไม่สำเร็จ กรุณาลองใหม่",
  };
  return messages[code] ?? messages.UNKNOWN!;
}
