/**
 * Display-only helpers used by the OA / PI **export** (Download / Print) path.
 * These never affect stored values or any calculation — they only change how
 * numbers are rendered in the exported document.
 */

/**
 * Whole-rupee rounding rule for the final Grand Total in exports:
 *  - fraction  > 0.50  → round up
 *  - fraction <= 0.50  → keep the lower whole rupee
 */
export function roundGrandTotalForExport(n: number): number {
  const v = n || 0;
  const sign = v < 0 ? -1 : 1;
  const abs = Math.abs(v);
  const whole = Math.floor(abs);
  const frac = abs - whole;
  // Guard against float noise (e.g. 0.5000000001 from arithmetic).
  const rounded = frac - 0.5 > 1e-9 ? whole + 1 : whole;
  return sign * rounded;
}

/** Number formatting options: 2 decimals in export mode, current behaviour otherwise. */
export function moneyDigits(exportMode?: boolean): Intl.NumberFormatOptions {
  return exportMode
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { maximumFractionDigits: 0 };
}
