import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Display-only quantity formatter: rounds to 2 decimals.
 * 10 → "10.00", 10.5 → "10.50", 10.567 → "10.57".
 * Null/undefined/empty/non-finite → fallback ("—" by default).
 */
export function fmtQty2(value: unknown, fallback = "—"): string {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n.toFixed(2);
}
