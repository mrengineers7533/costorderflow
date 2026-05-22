# Plan — Place Make column right after Description (BOQ + PI)

## 1. BOQ — move the Make column to immediately after Description

Today the hidden Make column renders between **Model Number** and **Description**. Reorder it so the columns become:

`Item No. | Model Number | Description | Make | Qty | Unit | Remarks | Approved by Design`

Make stays **hidden by default** — only the position changes when it is toggled on.

Files touched:

- `src/pages/boqs/BoqEditor.tsx`
  - `BoqItemsList` grid: move the `showMake` cell to sit between Description and Quantity. Update the `grid-cols-[...]` template so the Make column slot moves accordingly.
  - Live HTML preview block (`<td>` around line 957): move the Make `<td>` to right after the Description `<td>`.
- `src/lib/boq/pdf.ts`: change `base.splice(2, …)` → `base.splice(3, …)` and update `headRow`, `approvalIdx`, `columnStyles`, and the `emptyRow` "(no items)" index so Make sits after Description.
- `src/lib/boq/pdfDistribution.ts`: same column reorder for the distribution PDF.
- `src/lib/boq/excel.ts`: same column reorder for the Excel export.

No column widths, totals, or default-hidden behaviour change. When `showMake` is false the output is byte-identical to today.

## 2. PI — inherit Make from OA, hidden by default in print

PI line items already use the OA `LineItem` type, which carries `make_label`. `convertOaToPi` / `syncPiFromOa` in `src/lib/pi/convert.ts` pass `line_items` through unchanged, so OA's Make value is already preserved on the PI record.

The PI PDF also already supports a Make column through the shared `pdfColumns` (`src/lib/orders/pdf.ts` → `case "make": displayMake(it)`), and `PiEditor.tsx` defaults `hiddenPdfColumns` to include `"make"` so it stays hidden on the printable until the user explicitly enables it.

Verification-only step (no code change expected):

- Confirm `convertOaToPi` does not strip `make_label` — re-read `src/lib/pi/convert.ts` and the `buildClientCopyItems` helper used at lines 114–115 to make sure `make_label` survives the mapping. If either drops it, add a one-line passthrough (`make_label: item.make_label`) so the OA Make value reaches the PI line item.
- Confirm the PI PDF columns place Make immediately after Description in the on-screen `PdfColumnVisibility` toggle order; if the shared `pdfColumns` order in `src/lib/orders/pdfColumns.ts` puts Make elsewhere for the PI surface, reorder only the PI usage (not OA) so the printable shows Make right after Description.

## 3. Consistency guarantee

- BOQ Make continues to come from OA via existing propagation in `src/lib/revisions/index.ts` (`make: it.make_label || prev?.make || ""`).
- PI Make comes directly from OA `LineItem.make_label` on every convert/sync.
- Single source of truth = OA item. No new storage, no new write paths.

## Out of scope / untouched

- No DB migrations, no RLS changes, no edge-function changes.
- No changes to OA editor / OA PDF, calculations, approval rules, revisions, or notifications.
- No repositioning of the Make column in Requisition / Purchase / Manufacturing surfaces (not requested in this round).
- Default visibility stays **hidden** on every surface; existing PDFs/Excel without the toggle remain byte-identical.
