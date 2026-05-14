## Allow hiding the Amount column in PDF / Preview

Currently `amount` is marked `required: true` in `src/lib/orders/pdfColumns.ts`, so the PdfColumnVisibility popover disables its checkbox. The user wants Amount to be hideable while keeping the bottom totals block (Basic Amount, GST/Taxes, Grand Total, Net Payable, Amount in Words) intact.

### Changes

1. **`src/lib/orders/pdfColumns.ts`**
   - Remove `required: true` from the `amount` entry so it becomes a normal toggleable column.
   - `item_no` and `description` stay required (need at least one anchor column).

2. **`src/components/orders/OrderPreview.tsx`**
   - Item table already maps over `visibleColumns`, so hiding `amount` will drop the column automatically.
   - Update the totals row `colSpan` logic so the "Basic Amount / GST / Grand Total / Net Payable" labels and values still align correctly when `amount` is absent:
     - When `amount` is visible: label spans `visCols.length - 1`, value sits in the amount column (current behavior).
     - When `amount` is hidden: render the totals as a separate block under the table (full-width rows with label on the left and value on the right) so they remain clearly visible without an Amount column to anchor to.
   - Amount in Words line is already a separate full-width row — no change needed.

3. **`src/lib/orders/pdf.ts`** (MR + GMS branches) and **`src/lib/pi/pdf.ts`**
   - `head` / `itemRows` / `columnStyles` already build from `visibleColumns`, so hiding `amount` drops it from the table head/body.
   - Totals rendering: today the totals rows are appended into the same autoTable with `colSpan` math against the item columns. Update so when `amount` is hidden, totals render as a standalone autoTable below the items table with two columns (label, value) — keeps Basic Total, P&F, Insurance, Freight, Subtotal, GST, Discount, Grand Total, Advance, Net Payable, and Amount in Words exactly as they appear today, just decoupled from the item-table column grid.
   - No changes to calculations, currency labels, or any other charge logic.

### Out of scope
- Calculations, currency conversion, MR vs GMS split, OA→PI carry-forward, DB schema.
- Any column behavior other than making `amount` hideable.

### Acceptance
- "Amount" appears as a normal (non-disabled) checkbox in the PDF Columns popover on both OA and PI editors, MR and GMS formats.
- Hiding it removes the Amount column from Preview and PDF.
- Bottom totals block (Basic Amount, GST/Taxes, Grand Total, Net Payable, Amount in Words) still renders correctly in both Preview and PDF whether Amount is shown or hidden.
- All other features unchanged.
