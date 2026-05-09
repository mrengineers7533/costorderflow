## Goal
Add a "Create Client Copy" action to the OA editor that generates a customer-facing PDF where certain item categories are collapsed into single summary rows. The original OA, BOQ, PI, calculations, drafts, and finalization flow remain untouched.

## Scope
- UI only (button + PDF generation). No DB schema changes, no edits to existing OAs/BOQs/PIs.
- Reuse `generateOrderPDF` so the Client Copy looks identical to the OA (header, bill-to, ship-to, terms, taxes, totals, format MR/GMS) — only the line-items array is transformed before rendering.

## Item grouping rules (Client Copy only)
Apply category detection on each `LineItem.description` (case-insensitive, word-boundary regex). Each item belongs to **at most one** group; first match wins in this priority order so a "Fan Accessories" line goes to group 4 (not group 3):

1. **Material Handling Equipments** — keywords: `elevator`, `conveyor`, `vmc`
   → Description: `Material Handling Equipments (Conveyors, Elevators, VMC's) - approx*`
   → Quantity: Σ qty, Total Amount: Σ amount
2. **Magnets** — keyword: `magnet`
   → Description: `Magnets (J. K.)`
   → Quantity: Σ qty, Total Amount: Σ amount
3. **Centrifugal Fans** — keyword: `fan` (but NOT `fan accessor`/`accessories`)
   → Description: `Centrifugal Fans (Ferrari)`
   → Quantity: Σ qty, Total Amount: Σ amount
4. **Spouting / Ducting / Manifold / Fan Accessories** — keywords: `spouting`, `aspiration ducting`, `pneumatic manifold`, `ducting`, `manifold`, `fan accessor`
   → Description: `Spouting, Aspiration Ducting & Pneumatic Manifold - approx*`
   → Quantity: **1** (per spec), Total Amount: Σ amount
5. **All others** — passed through unchanged.

For each group row the synthesized `LineItem` keeps `unit_rate = total_amount / quantity` so the existing PDF renderer (which prints rate × qty = amount) still shows a coherent amount column. `unit = "Lot"` for group 4, otherwise the unit from the first matched item.

Charges (P&F, GST, freight, discounts, etc.) and totals are recomputed via the existing `calcTotals(transformedItems, charges)` so subtotal/GST/grand total continue to match because Σ(qty × rate) per group = Σ(original amounts).

## UI
- Add a `Create Client Copy` button in the action button row in `OrderEditor.tsx` (next to "Convert to PI"), icon `Users` from lucide-react. Visible only when `!isNew` (same as the other revision actions).
- On click: build the transformed line-items, call `generateOrderPDF` with the same `{ terms, bank, gmsTerms, tcNote }` options used by the existing `downloadPDF`, save as `{OA_NUMBER}-CLIENT-COPY.pdf`. Show a toast.
- For mixed-make (split) OAs, follow the same pattern as `downloadPDF`: use the currently selected `format` and that side's items + charges, then apply grouping.

## Files touched
- **New:** `src/lib/orders/clientCopy.ts` — pure function `buildClientCopyItems(items: LineItem[]): LineItem[]` plus the regex/keyword config. Unit-tested via a small Vitest spec.
- **New:** `src/test/clientCopy.test.ts` — covers grouping priority, sums, group-4 quantity-of-1, untouched passthrough.
- **Edit:** `src/pages/orders/OrderEditor.tsx` — import the helper, add `downloadClientCopy()` mirroring `downloadPDF`, add the button.

## Out of scope
- No header label like "CLIENT COPY" watermark on the PDF (spec says it should look like the existing OA document). Easy to add later if requested.
- No DB persistence of client copies — generated on-demand.
- No changes to OA preview screen, BOQ, PI, or calculation logic.
