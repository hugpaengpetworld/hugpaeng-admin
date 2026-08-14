export default function AuthLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#123c2f] px-4 py-10">
      <div
        aria-hidden="true"
        className="absolute -top-28 -right-28 size-80 rounded-full bg-[#4f9674]/30 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-28 -left-28 size-80 rounded-full bg-[#8ac5a6]/20 blur-3xl"
      />
      <div className="relative w-full max-w-5xl">{children}</div>
    </main>
  );
}
