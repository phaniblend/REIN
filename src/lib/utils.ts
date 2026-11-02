import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function money(value: number | string, currency = "USD") {
  const n = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

export function num(value: string | number | null | undefined, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Unit cost needs more than 2 decimals so $0.0025/G does not become $0. */
export function formatUnitCost(value: number) {
  return (Number.isFinite(value) ? value : 0).toFixed(6);
}

/** Invoice unit prices as fractional cents (e.g. $0.0016 → 0.16). */
export function formatPriceCents(dollars: number) {
  return (Number.isFinite(dollars) ? dollars * 100 : 0).toFixed(4);
}
