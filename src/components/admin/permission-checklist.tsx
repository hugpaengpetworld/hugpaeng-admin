import type { TenantPermission } from "@/domain/auth/permissions";

export interface PermissionChecklistOption {
  readonly code: TenantPermission;
  readonly label: string;
  readonly description: string;
}

export function PermissionChecklist({
  options,
  selected = [],
}: {
  readonly options: readonly PermissionChecklistOption[];
  readonly selected?: readonly string[];
}) {
  return (
    <fieldset className="rounded-xl border border-emerald-900/10 p-3 sm:col-span-2">
      <legend className="px-1 text-sm font-bold">สิทธิ์รายบุคคล</legend>
      <p className="mb-3 text-xs text-slate-600">
        OWNER และ ADMIN ได้สิทธิ์ทั้งหมดอัตโนมัติ
        ส่วนบทบาทอื่นปรับได้ตามหน้าที่จริง
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((option) => (
          <label
            key={option.code}
            className="flex min-h-11 items-start gap-2 rounded-lg bg-[#f5f8f6] p-2 text-sm"
            title={option.description}
          >
            <input
              type="checkbox"
              name="permissions"
              value={option.code}
              defaultChecked={selected.includes(option.code)}
              className="mt-0.5 size-5 shrink-0"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
