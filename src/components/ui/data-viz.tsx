import { cn } from "@/lib/utils";

type DataAlertProps = {
  title: string;
  message: string;
  count?: number | string;
  icon?: React.ReactNode;
  className?: string;
};

/** Tan alert strip — Restman “Expiry watch” pattern */
export function DataAlert({
  title,
  message,
  count,
  icon,
  className,
}: DataAlertProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl bg-[var(--tan)] px-3 py-3",
        className,
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface)] text-[var(--accent)]">
        {icon ?? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
            <path
              d="M12 8v4l2.5 1.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--fg)]">{title}</p>
        <p className="truncate text-xs text-[var(--muted)]">{message}</p>
      </div>
      {count !== undefined && (
        <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-[var(--accent)] px-2 text-xs font-semibold text-[var(--accent-fg)]">
          {String(count).padStart(2, "0")}
        </span>
      )}
    </div>
  );
}

type MiniBarChartProps = {
  title?: string;
  bars: { label: string; value: number }[];
  className?: string;
};

/** Mint bars with forest-green caps */
export function MiniBarChart({ title, bars, className }: MiniBarChartProps) {
  const max = Math.max(...bars.map((b) => b.value), 1);

  return (
    <div className={cn("space-y-3", className)}>
      {title ? (
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          {title}
        </p>
      ) : null}
      <div className="flex h-28 items-end justify-between gap-3 px-1">
        {bars.map((b) => (
          <div key={b.label} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex h-24 w-full items-end justify-center">
              <div
                className="rm-bar w-[70%] max-w-10"
                style={{ height: `${Math.max(8, (b.value / max) * 100)}%` }}
              />
            </div>
            <span className="text-[10px] font-medium text-[var(--muted)]">
              {b.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type StatTileProps = {
  label: string;
  value: string;
  tone?: "cream" | "forest";
  className?: string;
};

export function StatTile({
  label,
  value,
  tone = "cream",
  className,
}: StatTileProps) {
  return (
    <div
      className={cn(
        "rounded-2xl px-4 py-3",
        tone === "forest"
          ? "bg-[var(--accent)] text-[var(--accent-fg)]"
          : "bg-[var(--tan)] text-[var(--fg)]",
        className,
      )}
    >
      <p
        className={cn(
          "text-xs",
          tone === "forest" ? "text-white/70" : "text-[var(--muted)]",
        )}
      >
        {label}
      </p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold">
        {value}
      </p>
    </div>
  );
}
