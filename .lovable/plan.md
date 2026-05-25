# Advance Adjustment on Basic Total + OA→PI charge editability

## Scope

Two changes — **MR only** (OA + PI). GMS Turkey/Murthal, BOQ, exports for non-MR flows: untouched.

---

## 1. Advance Adjustment base → Basic Total (MR OA + MR PI)

Today: `Advance Amount = Grand Total × adv%`. New: `Advance Amount = Basic Total × adv%`. Flat-₹ mode unchanged. `Net Payable = Grand Total − Advance` (same as today).

Files to update (percent branch only — replace the multiplier base with `basic_total`):

- `src/pages/orders/OrderEditor.tsx` (~line 1846) — MR live breakdown.
- `src/components/orders/OrderPreview.tsx` (~line 402) — Review/Export preview for MR OA.
- `src/lib/orders/pdf.ts` (~line 303) — MR OA PDF.
- `src/pages/pi/PiEditor.tsx` (~line 179, `piAdvanceAmt`) — MR PI live breakdown.
- `src/lib/pi/pdf.ts` (~line 61) — MR PI PDF.
- `src/lib/pi/excel.ts` (~line 123–126) — MR PI Excel (recompute amount from basic when percent mode).

In each spot, gate the new base on `format === "MR"` (PI: `pi.format === "MR"`). GMS Turkey/Murthal advance logic in `src/lib/orders/calc.ts` (`calcExTurkey`, `calcExMurthal`) and corresponding preview/PDF branches stay on Grand-Total base.

Label stays `Advance Adjustment @ N%` (matches user's example).

## 2. OA → PI charges carry over + manual edit on MR PI

`src/lib/pi/convert.ts` already copies `oa.charges` into the new PI (line 217) so carry-over works. Gap is editability: MR PI editor currently only exposes Advance + Discount and says "Charges, discount, taxes mirror the OA."

Update `src/pages/pi/PiEditor.tsx` MR branch (the "PI adjustments" card, ~line 411–600):

- Add editable inputs for `pi.charges.pf_percent` / `pf_amount`, `insurance_percent` / `insurance`, `freight_enabled` + `freight`, `gst_percent`. Pre-filled from OA (already in `pi.charges`); user can edit or add missing ones.
- Each writes via `update("charges", { ...pi.charges, <field>: v })`, which already flows through `calcPiTotals` and persists on save.
- Drop the "mirror the OA" helper text; replace with "Charges carry over from the OA — edit if needed."

GMS PI charges UI: unchanged.

## 3. Verification

User's example (MR): Basic 23,000; P&F 1.5% = 345; Subtotal 23,345; GST 18% = 4,202.10; Grand 27,547.10. Advance 10% on Basic = 2,300. Net Payable = 25,247.10. Verify in: MR OA live breakdown, OA Review/Export preview, OA PDF, MR PI live breakdown, PI PDF, PI Excel.

Also verify: editing P&F / Insurance / Freight / GST on a freshly-created MR PI updates the totals and saves; GMS PI (Turkey / Murthal / CIF) Review/Export/PDF unchanged; GMS Turkey/Murthal advance still uses Grand-Total base.

## Out of scope

- `calcPiTotals` signature and OA `calc.ts` Turkey/Murthal logic — not touched.
- BOQ, OA→PI conversion logic (only the editor UI gains inputs), discount label/order, GMS PI editor.
