import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "flex h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = "Input";
