## Goal

Make the on-screen **Live Preview** mirror exactly what the **Export PDF** produces — for both **MR** and **GMS** formats. Today the preview diverges from the PDF in several visible ways; we'll bring it into parity (visual layout, sections, ordering) so what the user sees is what they download.

## What's different today (preview vs PDF)

### MR
| Section | Preview today | PDF (target) |
|---|---|---|
| Header | Big primary-colored "M.R. ENGINEERS PVT. LTD." block + tagline + GST/Tel/Email pill row | Logo (left) + right-aligned `M.R. Engineers` name, `* ENGINEERS * CONTRACTORS * SUPPLIERS` tagline, `Shed No. 33, HSIIDC, Murthal, Sonepat.`, `GSTIN-06AARPM1849G1ZF`, with a thin orange accent rule beneath |
| ORDER ACCEPTANCE | Centered text under header | Same — keep |
| Meta | 2×2 bordered table (OA/Date/Ref/PreparedBy) | Already matches |
| Bill/Ship | Bordered table | Already matches |
| Items + totals | Already matches | — |
| Post-items | Terms → Bank/Signature → "M.R. ENGINEERS" small label → yellow address strip | Preview has Terms → Bank/Signature → yellow strip but is **missing the small "M.R. ENGINEERS" label row** above the yellow strip |

### GMS
| Section | Preview today | PDF (target) |
|---|---|---|
| Header | Single GMS logo, centered, with `GRAIN MILLING SOLUTIONS PVT. LTD.` text | **Dual-logo banner**: GMS logo + caption on the left, **Uğur logo** + `UGUR MACHINE, TURKEY` + italic `Quality Standard is an Assurance of UGUR at all parts` on the right |
| ORDER ACCEPTANCE bar | Centered band with subtle gradient | Solid grey title bar (`#C8C8C8`) under the header, repeated on every page |
| Customer/Meta | Bordered table with customer-left / meta-right | Same data, but as a flowing two-column block (no outer border) — bring preview in line with PDF (drop the outer border, keep the two-column layout) |
| Items table | 7 columns: `S.No, Description, HSN, Qty, Unit, Rate, Amount` | **8 columns**: `ITEM NO, MODEL NUMBER, DESCRIPTION, HSN CODE, QTY, UNIT, UNIT PRICE (INR), AMOUNT (INR)` with grey header fill and the GMS-specific totals labels (`Ex-works Murthal Price`, `One time very special Discount`, `After Discount`, `Packaging & Forwarding`, `Insurance`, `Freight`, `GST @x%`, **`Grand Total`** bold) |
| Footer block | Currently only shown when `isFX` (FX mode) | Always show on GMS — two-column **HEAD OFFICE** + **Our Bank Details** block, fix the typo `GRAIIN` → `GRAIN`, and use the new bank label format (`GRAIN MILLING SOLUTIONS PVT. LTD.`, then `Bank :`, `Branch :`, `A/C No :`, `IFSC CODE :`) |
| Terms & Conditions | Renders inline below items | **Dedicated page-break section** styled like the PDF: centered `TERMS & CONDITIONS` title, underlined `COMMERCIAL CONDITION :` heading, then the 6 rows (Taxation, Freight, INSURANCE, Delivery Time, Payment Terms, General Conditions) with the same HEAD OFFICE / Bank footer at the bottom — already partially in place, just needs alignment with the PDF version's structure & labels |

## Implementation

Edit only **`src/components/orders/OrderPreview.tsx`** (no PDF / data changes needed):

1. **MR header (`MRHeader` component)** — rebuild to mirror the PDF: keep the existing logo image but replace the right-side block to render
   - `M.R. Engineers` (bold, large)
   - `*  ENGINEERS    *  CONTRACTORS    *  SUPPLIERS` (bold, small)
   - `Shed No. 33, HSIIDC, Murthal, Sonepat.` (regular, small)
   - `GSTIN-06AARPM1849G1ZF` (bold, small)
   - Thin orange accent rule beneath the whole header
   - Centered `ORDER ACCEPTANCE` line below
   Drop the GST/Tel/Email pill row (PDF doesn't show it).

2. **MR post-items (`MRPostItems`)** — insert a small right-aligned `M.R. ENGINEERS` label row (bold, bordered, no fill) **between** the Bank/Signature row and the yellow address strip, matching the PDF's layout.

3. **GMS header (`GMSHeader`)** — replace the single-logo block with a dual-logo banner:
   - **Left**: GMS logo (aspect-preserved, ~h-16) + below it bold `GRAIN MILLING SOLUTIONS PRIVATE LIMITED`
   - **Right**: import `ugur-logo.png` (already exists in `src/assets/`), aspect-preserved (~h-16), then bold `UGUR MACHINE, TURKEY`, then italic `Quality Standard is an Assurance of UGUR at all parts`
   - Below: solid grey (`bg-neutral-300` or HSL equivalent) `ORDER ACCEPTANCE` bar (replaces the current gradient band)
   - The customer/meta block becomes a borderless two-column flex/grid (left = M/s name + address + contact lines + GSTIN; right = Date/OA/Ref/Contact/Mob/Prepared By right-aligned), matching the PDF.

4. **GMS items table** — change the table head to the 8 PDF columns (`ITEM NO | MODEL NUMBER | DESCRIPTION | HSN CODE | QTY | UNIT | UNIT PRICE (INR) | AMOUNT (INR)`) with a grey header background, only when `format === "GMS"`. MR continues to use the current 7-column layout. Add an empty `Model Number` cell per row (we don't store it separately yet — same as the PDF). Update `TotalsRow` `colSpan` to 7 for GMS / 6 for MR (or split into two row helpers).

5. **GMS totals labels** — when `format === "GMS"` (and not FX/Murthal), use the GMS-specific labels: `Ex-works Murthal Price`, `One time very special Discount`, `After Discount`, `Packaging & Forwarding`, `Insurance`, `Freight`, `GST @x%`, **`Grand Total`** (bold). MR keeps `Basic Total / Subtotal / Grand Total` as today.

6. **GMS footer block** — render `<GMSFooter>` (or a renamed `GMSHeadOfficeBank` block) for **all** GMS previews, not just FX. Fix the `GRAIIN` typo and reformat per PDF (`GRAIN MILLING SOLUTIONS PVT. LTD.` + `Bank :` / `Branch :` / `A/C No :` / `IFSC CODE :`).

7. **GMS T&C block** — keep the existing `GMSTermsBlock`, just ensure it always renders for GMS (it already does when `gmsTerms` is set), and verify it visually matches the PDF: centered title, underlined `COMMERCIAL CONDITION :`, 6 labeled rows, head-office/bank footer at bottom, with `page-break-before` for print parity.

## Out of scope

- PDF code (`src/lib/orders/pdf.ts`) — already correct, not touched.
- New data fields (e.g. a real "Model Number" column) — preview will mirror the PDF's currently-blank model column.
- FX / Ex-works Murthal layouts — already match between preview and PDF; left untouched.

## Files to edit

- `src/components/orders/OrderPreview.tsx` — all changes above (rebuild `MRHeader`, tweak `MRPostItems`, rebuild `GMSHeader` with dual logos + grey bar, switch GMS items table to 8 columns + GMS-specific totals labels, always render GMS head-office/bank footer, polish `GMSTermsBlock` typography to match the PDF, fix `GRAIIN` typo, import `@/assets/ugur-logo.png`).
