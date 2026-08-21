# Fix: Create PI must show the OA's actual line items

## Root cause (confirmed by reading the code)

For MR-format OAs the Create PI flow does not read the OA's saved line items directly. It first passes them through the Client Copy summarizer:

- `src/components/pi/PiItemSelectDialog.tsx` (line 67): `isMR ? buildClientCopyItems(oa.line_items) : oa.line_items`
- `src/lib/pi/convert.ts` (line 112-116): same grouping used as the source pool when the PI is created

`buildClientCopyItems` (`src/lib/orders/clientCopy.ts`) collapses any description containing "ducting", "spouting", "manifold" etc. into one synthetic row `Spouting, Aspiration Ducting & Pneumatic Manifold - approx*`, Qty 1 Set, rate = combined amount. That is exactly the row seen for MROA/2026-27/0081 (₹10,340 = 6,600 + 3,740). So the two Ducting Pipe rows are merged before the popup ever renders.

The PI document itself is unaffected by this change: `src/lib/pi/pdf.ts`, `src/lib/pi/excel.ts` and `src/pages/pi/PiEditor.tsx` apply `buildClientCopyItems` at render time, so an MR PI storing the real OA lines still prints the grouped Client Copy layout as today.

## Changes

1. **Selection popup uses real OA lines** — in `PiItemSelectDialog.tsx`, drop the MR grouping and always use `oa.line_items`. Balance columns switch to the standard per-line qty/amount balance that GMS already uses; Select All, partial qty/amount inputs, Already-PI and Balance columns keep working unchanged.

2. **PI creation uses real OA lines** — in `src/lib/pi/convert.ts`, `sourcePool` becomes `oa.line_items` for every format. Everything downstream (numbering, totals, charges, GMS landed-cost, currency, notes) is untouched.

3. **Legacy grouped PIs still count** — in `fetchOaItemPiStatus`, when a stored PI line has a synthetic id (`client-copy-*`), map it back to the OA's real lines: detect which OA lines belong to that group (same detection used by the Client Copy builder) and distribute the grouped `pi_qty`/`pi_amount` across them in proportion to each line's amount. So OAs that already have grouped PIs keep the correct Already-PI Amount and Balance per line, and fully consumed lines stay consumed.

No schema, RLS, RPC, PDF, numbering, approval, notification, BOQ/Requisition/Purchase changes.

## Verification

- Open MROA/2026-27/0081 → Create PI → popup must show the two Ducting Pipe rows (2 Nos @ 3,300 and 1 Nos @ 3,740), not the Spouting summary row.
- Create a partial PI on one row, reopen the popup: Already PI / Balance qty and amount correct, other row untouched.
- Open an older MR OA that already has a grouped PI and confirm its balances are unchanged (not reset to full).
- Confirm the generated PI PDF/editor still renders the grouped Client Copy layout for MR.
