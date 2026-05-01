## Add per-row Download PDF action to Orders list

In `src/pages/orders/OrdersList.tsx`, add a Download button to the Actions cell of each OA row, between Edit and Delete.

### Changes

1. Import `Download` from `lucide-react` and `generateOrderPDF` from `@/lib/orders/pdf`.
2. Add a small async handler `downloadOrderPdf(o: OrderRecord)`:
   - Calls `generateOrderPDF(o)`.
   - Saves with filename `${o.oa_number.replace(/[/\\]/g, "_")}.pdf`.
   - Shows a toast on success/failure.
3. In the Actions cell, insert a new ghost `Button` with the `Download` icon between Edit and Delete:
   - Same sizing as Edit (`h-8 px-2`).
   - Stops row-click propagation.
   - `aria-label={`Download ${o.oa_number}`}`.

### Out of scope

- No changes to BOQ/PI lists, header buttons, or PDF generation logic.