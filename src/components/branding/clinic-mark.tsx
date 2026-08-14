export function ClinicMark({
  logoUrl,
  thaiName,
  compact = false,
}: {
  readonly logoUrl: string | null;
  readonly thaiName: string;
  readonly compact?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {logoUrl ? (
        // Signed Supabase URLs are short-lived and tenant-authorized.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={`โลโก้ ${thaiName}`}
          className="size-11 shrink-0 rounded-xl border border-white/20 bg-white object-contain p-1"
        />
      ) : (
        <div
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15 text-lg font-black text-white"
        >
          BMP
        </div>
      )}
      {!compact && (
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{thaiName}</p>
          <p className="truncate text-xs text-emerald-100">BMP Booking</p>
        </div>
      )}
    </div>
  );
}
