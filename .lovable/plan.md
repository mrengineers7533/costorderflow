# OA / PI Export Formatting Corrections

Applies to OA (MR + GMS) and PI **Download / Export / Print output only**. Live Preview on screen, all calculations, stored data, layout, columns and other modules stay untouched.

## What changes

1. **Signature area** — in exported output the creator name under "Yours faithfully / M.R. ENGINEERS" is hidden. "Prepared By: <name>" in the header stays exactly as it is. Nothing is changed in the database.
2. **2 decimal places everywhere money is shown** in the export: Rate, Amount, Basic Total, P&F, Subtotal, GST, Grand Total, Net Payable and the GMS/EXW totals card (54 -> 54.00, 5,270 -> 5,270.00).
3. **Grand Total rounding** — the row labelled *Grand Total* is rounded to whole rupees using: paisa greater than 0.50 rounds up, 0.50 or less keeps the lower rupee; displayed with `.00`. Applies to OA and PI exports. Net Payable and Amount in Words are left as they are today.

## How it will be done (technical)

- `src/components/orders/OrderPreview.tsx`: add one optional prop `exportMode?: boolean` (default false, so Live Preview is byte-identical to today). When true:
  - the money formatters (`fmt`, `fmtFX`, the item Rate/Amount formatters, `TotalsRow` default formatter, the GMS/EXW card formatters) switch from `maximumFractionDigits: 0` to `minimumFractionDigits: 2, maximumFractionDigits: 2`;
  - the Grand Total row's value passes through a shared helper before formatting;
  - the `preparedBy` line in the MR signature block (`MRPostItems`) and the GMS signature block is not rendered.
- New shared helper in `src/lib/orders/calc.ts` (or a small `exportFormat.ts`): `roundGrandTotalForExport(n)` = `frac > 0.5 ? ceil : floor`, plus a `formatMoney2(n, locale)` used by both preview-export and the jsPDF route so OA and PI format identically.
- `src/lib/orders/previewExport.tsx`: pass `exportMode` to the off-screen `OrderPreview` (covers OA list + revisions downloads).
- `src/pages/orders/OrderEditor.tsx`: its Download button currently rasterises the visible preview. It will instead call the existing off-screen export helper (`exportOrderPreviewPdf`) with the same order data and options, so the visible preview is never modified, re-rendered, or flashed.
- `src/pages/pi/PiEditor.tsx`: add a PI equivalent of that helper — an off-screen render of `OrderPreview` with `exportMode` and exactly the same props the visible PI preview receives — and capture that clone. The on-screen PI preview stays untouched.
- No temporary state toggling of any visible component; `exportMode` exists only on off-screen render paths.
- `src/lib/orders/pdf.ts` (jsPDF fallback used by OA/PI list downloads): already prints 2 decimals; only add the Grand Total rounding so both routes agree, and drop `order.prepared_by` from the "Yours faithfully" signature block. `src/lib/pi/pdf.ts` inherits this automatically.

## Not touched

Calculations, GST/P&F/subtotal logic, currency conversion, numbering, approval/workflow, DB values, column widths, table alignment/centering work, Terms & Conditions, Bank Details, Amount in Words, and every other module or document PDF.

## Verification

Export one MR OA, one GMS OA and one PI, and confirm: no creator name in the signature block, all rates/amounts show 2 decimals, and Grand Total follows the rounding rule (37,871.50 -> 37,871.00; 37,871.51 -> 37,872.00). Live Preview compared before/after to confirm it is unchanged.
