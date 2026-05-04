## Remove duplicate "Grand Total" row after Net Payable in PI PDF

**Issue:** The PI PDF currently shows two Grand Total rows — one before Advance Adjustment (correct) and a duplicate one after Net Payable (incorrect). The screenshot shows the redundant trailing row circled.

**Root cause:** `src/lib/pi/pdf.ts` adds an extra `Grand Total` to `extraTotalsRows` while the underlying `generateOrderPDF` (`src/lib/orders/pdf.ts`) already prints a Grand Total row from the GST + taxable computation. The OA PDF appends `extraTotalsRows` *after* its own Grand Total, producing: `... GST → Grand Total → Grand Total (extra) → Advance → Net Payable`.

### Fix

In `src/lib/pi/pdf.ts`, inside the `if (t.advance_adjustment_amount > 0)` block, remove this line:

```ts
extraTotalsRows.push({ label: "Grand Total", value: t.gross_invoice_total, bold: true });
```

Resulting order becomes: `… GST → Grand Total → Advance Adjustment → Net Payable`, matching the intended layout.

No other files need changes. MR/GMS OA PDFs are unaffected.