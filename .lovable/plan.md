## Goal

In the **Proforma Invoice** (GMS format), remove the highlighted block (Exclusions list, USD conversion line, HEAD OFFICE address, and Bank details) from **page 1** of both the live preview and the generated PDF, and show it only on the **T&C / last page** along with the Terms & Conditions.

The OA (Order Acceptance) flow is unchanged — this only affects PI.

---

## Changes

### 1. `src/components/orders/OrderPreview.tsx`
Add a new `docMeta` flag `hideFirstPageFooter?: boolean`. When set:
- Skip the `<GMSFooter />` render (the exclusions + USD rate + HEAD OFFICE + bank block shown when FX).
- Skip the `<GMSHeadOfficeBank />` render (HEAD OFFICE + bank block shown when not FX).
- Inside `<GMSTermsBlock />`, additionally render the exclusions list and USD conversion line **above** the existing `<GMSHeadOfficeBank />` so the moved content lives entirely on the T&C section.

Pass currency + fxRate into `GMSTermsBlock` so the USD conversion sentence can be rendered there.

### 2. `src/lib/orders/pdf.ts`
Add `hideFirstPageFooter?: boolean` to `DocMetaOverride`. In `renderGmsPdf`:
- Skip the `drawFooterBlock(yEnd)` call after page-1 totals when the flag is set.
- On the T&C page, before `drawFooterBlock`, render the exclusions lines and the USD conversion sentence (mirroring the preview).

### 3. `src/lib/pi/pdf.ts`
Pass `hideFirstPageFooter: true` inside the `docMeta` object sent to `generateOrderPDF`.

### 4. `src/pages/pi/PiEditor.tsx`
Pass `hideFirstPageFooter: true` inside the `docMeta` object sent to `<OrderPreview />`.

---

## Result

- **PI page 1**: items table, totals, net payable — no Exclusions, no USD rate line, no HEAD OFFICE/Bank block.
- **PI last page (T&C)**: Terms & Conditions section, followed by Exclusions + USD conversion line + HEAD OFFICE + Bank details at the bottom.
- **OA**: unchanged.