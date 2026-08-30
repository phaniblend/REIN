import Link from "next/link";

export default function HomePage() {
  return (
    <div className="relative mx-auto flex min-h-full w-full max-w-lg flex-col justify-between px-5 py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,_#9fd5ce_0%,_transparent_65%)] opacity-70 animate-pulse-soft" />

      <div className="relative animate-rise space-y-6 pt-8">
        <p className="font-[family-name:var(--font-display)] text-5xl font-semibold tracking-tight text-[var(--fg)]">
          KitchenYield
        </p>
        <h1 className="max-w-[16ch] text-2xl font-medium leading-snug text-[var(--fg)]">
          Close the loop between purchases, recipes, and unexplained shrink.
        </h1>
        <p className="max-w-[34ch] text-[var(--muted)]">
          Blind shift counts, Actual vs Theoretical variance, and Gemini-assisted
          menu BOMs for your kitchen.
        </p>
        <div className="flex gap-3 pt-2">
          <Link
            href="/register"
            className="inline-flex h-12 flex-1 items-center justify-center rounded-md bg-[var(--accent)] px-6 text-base font-medium text-[var(--accent-fg)]"
          >
            Start free
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 flex-1 items-center justify-center rounded-md border border-[var(--border)] bg-transparent px-6 text-base font-medium"
          >
            Sign in
          </Link>
        </div>
      </div>

      <p className="relative text-xs text-[var(--muted)]">
        Mobile-first PWA · PostgreSQL · Gemini recipe & area benchmarks
      </p>
    </div>
  );
}
