import type { UserOptions, Styles } from "jspdf-autotable";

/**
 * Shared jsPDF/autoTable defaults for every PDF export (OA, PI, BOQ, PO,
 * Requisition, Design Review, BOQ Distribution).
 *
 * Purpose: fix long-standing PDF text wrapping / alignment / row height /
 * page-break bugs by giving every table the SAME base configuration:
 *   - `overflow: 'linebreak'`  → long descriptions wrap inside the cell
 *   - `valign: 'top'`          → text sits at the top, not crammed against border
 *   - `cellPadding: 2.2`       → text never touches the cell border
 *   - `lineHeightFactor: 1.25` → readable line spacing
 *   - `rowPageBreak: 'avoid'`  → a row is NEVER split across two pages
 *   - `showHead: 'everyPage'`  → header row repeats when the table paginates
 *
 * This helper does NOT change any business logic (totals, calculations,
 * numbering, approval, notification, DB schema). It only normalizes the
 * jsPDF table rendering layer.
 */

export const PDF_BASE_STYLES: Partial<Styles> = {
  fontSize: 8.5,
  cellPadding: 2.2,
  lineHeightFactor: 1.25,
  valign: "top",
  overflow: "linebreak",
  lineColor: [0, 0, 0],
  lineWidth: 0.2,
};

export const PDF_HEAD_STYLES: Partial<Styles> = {
  fontStyle: "bold",
  halign: "center",
  valign: "middle",
  fillColor: [55, 65, 81],
  textColor: 255,
  lineColor: [0, 0, 0],
  lineWidth: 0.2,
};

export const PDF_TABLE_DEFAULTS: Partial<UserOptions> = {
  theme: "grid",
  styles: PDF_BASE_STYLES,
  headStyles: PDF_HEAD_STYLES,
  rowPageBreak: "avoid",
  showHead: "everyPage",
};

type Halign = "left" | "center" | "right";

/** Suggested horizontal alignment for common column semantic keys. */
export function alignFor(kind: string): Halign {
  const k = kind.toLowerCase();
  if (/(rate|amount|total|tax|gst|price|value|subtotal|net)/.test(k)) return "right";
  if (/(qty|quantity|unit|no\.|sno|s\.?no|serial|#|make|brand)/.test(k)) return "center";
  return "left";
}

/**
 * Deep-merge helper: caller-provided keys always win, but shared defaults
 * fill in anything the caller left blank (styles, headStyles, rowPageBreak…).
 */
export function withPdfTableDefaults(opts: UserOptions): UserOptions {
  const merged: UserOptions = { ...PDF_TABLE_DEFAULTS, ...opts };
  merged.styles = { ...PDF_BASE_STYLES, ...(opts.styles || {}) };
  merged.headStyles = { ...PDF_HEAD_STYLES, ...(opts.headStyles || {}) };
  if (opts.bodyStyles) merged.bodyStyles = { ...opts.bodyStyles };
  return merged;
}