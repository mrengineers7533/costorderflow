## Goal
Apply a display-only 2-decimal formatting to all Qty values shown on these pages:
- Annexure Folder (`src/pages/requisitions/AnnexureFolder.tsx`)
- PO Folder (`src/pages/purchase/PoFolder.tsx`)
- PO create / detail (`src/pages/purchase/PoCreateFromAnnexure.tsx`, including the PDF preview rendered there)
- PO PDF output (`src/lib/purchase/poPdf.ts`)
- Annexure Entry (the View dialog and downloaded PDF inside `AnnexureFolder.tsx`)

Format rule: truncate to 2 decimals with rounding ⇒ `10 → 10.00`, `10.5 → 10.50`, `10.567 → 10.57`. Empty/null stays as `—` (or empty in PDF cells, matching current behavior).

## Approach
Add a tiny shared helper (e.g. `fmtQty2` in `src/lib/utils.ts` or a new `src/lib/format.ts`) that returns `n.toFixed(2)` for finite numbers and `"—"` (or `""` for PDF) otherwise. Reuse it everywhere below — no calculation/logic changes.

## Display sites to update

**AnnexureFolder.tsx**
- Lot card table → `Grand Total` cell (`{e.total}`)
- View dialog table → row `Total Qty` (`{r.total_qty ?? "—"}`) and footer `Grand Total` (`{viewEntry.total}`)
- `downloadPdf()` autoTable → body `total_qty` cell and foot `Grand Total` cell

**PoFolder.tsx**
- Items table `Qty` cell (`{r.qty ?? 0}`)

**PoCreateFromAnnexure.tsx**
- Annexure rows preview table → `{r.total_qty ?? "—"}`
- PO preview line → `{x.qty} {x.row.unit || ""}`
- Any visible totals (e.g. `totalQty` if rendered)

**poPdf.ts**
- Row qty rendering at line 160 (`String(r.qty ?? "")`)
- Total qty rendering derived from `totalQty` at line 191

## Explicitly NOT changed
- Any math: `qty * rate`, gross/basic/gst/line totals, sums, validations
- Database writes — `qty: x.qty` payloads keep raw numeric values
- Rate, amounts, taxes, or any other numeric column
- Lot numbers, IDs, or non-quantity fields
- Other pages (RequisitionPlan, RequisitionDetail, etc. — already handled previously or out of scope)

## Verification
- Open Annexure Folder → confirm Grand Total and View dialog show `xx.xx`; download a PDF and confirm rows + grand total formatted.
- Open PO Folder → Qty column shows `xx.xx`.
- Create a PO from an annexure → preview rows and PO preview line show `xx.xx`; generated PO PDF shows `xx.xx` for row qty and total qty.
- Confirm computed amounts (basic, GST, line, grand totals) are unchanged numerically.
