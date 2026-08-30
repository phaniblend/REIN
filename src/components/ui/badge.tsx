import { cn } from "@/lib/utils";

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--fg)]",
        className,
      )}
      {...props}
    />
  );
}
