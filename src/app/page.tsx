import Link from "next/link";
import { RestmanLogo } from "@/components/restman-logo";
import { MiniBarChart, StatTile, DataAlert } from "@/components/ui/data-viz";

export default function HomePage() {
  return (
    <div className="relative mx-auto flex min-h-full w-full max-w-lg flex-col justify-between px-5 py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,_#d8e6d1_0%,_transparent_65%)] opacity-80 animate-pulse-soft" />

      <div className="relative animate-rise space-y-8 pt-6">
        <RestmanLogo size={36} />

        <div className="space-y-4">
          <h1 className="max-w-[14ch] font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight tracking-tight text-[var(--accent)]">
            Know what your kitchen uses. Stop what it wastes.
          </h1>
          <p className="max-w-[36ch] text-[var(--muted)]">
            Blind shift counts, Actual vs Theoretical variance, and Gemini-assisted
            menu BOMs — Restman keeps unexplained shrink off your P&amp;L.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/register"
            className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-[var(--accent)] px-6 text-base font-medium text-[var(--accent-fg)]"
          >
            Explore the workflow
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 flex-1 items-center justify-center rounded-full border border-[var(--fg)] bg-[var(--surface)] px-6 text-base font-medium"
          >
            Sign in
          </Link>
        </div>

        <div className="space-y-3 rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_8px_30px_rgba(38,71,53,0.06)]">
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Usage today" value="1,248 items" tone="cream" />
            <StatTile label="Waste avoided" value="18.4 kg" tone="forest" />
          </div>
          <MiniBarChart
            title="Usage by station"
            bars={[
              { label: "Prep", value: 72 },
              { label: "Service", value: 100 },
              { label: "Close", value: 48 },
            ]}
          />
          <DataAlert
            title="Expiry watch"
            message="6 ingredients need a plan before next service."
            count={6}
          />
        </div>
      </div>

      <p className="relative text-xs text-[var(--muted)]">
        restman · daily stock · mobile-first PWA
      </p>
    </div>
  );
}
