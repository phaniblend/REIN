import { cn } from "@/lib/utils";

type RestmanLogoProps = {
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
  size?: number;
};

/** RM monogram in chamfered square — Restman brand mark */
export function RestmanLogo({
  className,
  markClassName,
  showWordmark = true,
  size = 28,
}: RestmanLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("shrink-0 text-[var(--accent)]", markClassName)}
        aria-hidden
      >
        <path
          d="M9 6.5h24L39.5 15V41.5H9V6.5Z"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {/* Continuous monolinear RM */}
        <path
          d="M15.5 34.5V15h6.8c3.1 0 5.1 1.55 5.1 4.15 0 1.9-1 3.25-2.75 3.9L30.5 34.5M15.5 22.9h5.6M22.2 23.05 26.4 15.2l3.55 6.55 3.55-6.55V34.5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showWordmark ? (
        <span className="font-[family-name:var(--font-display)] text-xl font-semibold lowercase tracking-wide text-[var(--accent)]">
          restman
        </span>
      ) : null}
      <span className="sr-only">Restman</span>
    </span>
  );
}
