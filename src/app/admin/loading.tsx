export default function AdminLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto max-w-7xl animate-pulse space-y-5"
    >
      <span className="sr-only">กำลังโหลดข้อมูล</span>
      <div className="h-9 w-52 rounded-xl bg-slate-200" />
      <div className="h-24 rounded-2xl bg-white" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-44 rounded-2xl bg-white" />
        ))}
      </div>
    </div>
  );
}
