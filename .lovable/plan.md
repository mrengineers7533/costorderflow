## Goal

From the **Annexure Folder**, the user opens an annexure entry, sees a **PO preview in the fixed K.D Enterprises layout**, ticks the raw-material rows to include, fills vendor + rates, and clicks **Generate PO**. The PO is saved and downloaded as PDF. Selected rows get marked `po_status='created'` so they can't be reused until the PO is cancelled. Email/Send stays in the UI but is non-blocking — disabled with a tooltip ("Email not configured"). Nothing else in ES, annexure, requisition, or existing purchase flows changes.

---

## 1. Entry point (no UI break)

`AnnexureFolder.tsx` already has a "Generate PO" (`ShoppingCart`) action per row. Re-point that action to a new route:

```
/annexures/:annexureId/po/new?lot=<lot>&type=<steel|machine|3p>
```

No other changes to AnnexureFolder. Existing `PurchaseMaterial.tsx` and current PO Folder stay exactly as they are.

## 2. New page: `PoCreateFromAnnexure.tsx`

Route: `/annexures/:annexureId/po/new` (guarded by `RequireModule module="purchase"`).

Layout = **two stacked sections on one page**, no tabs, no modal — so the user always sees the template before generating:

### A. Selection panel (top)
- Heading: annexure no · lot · category.
- Table of `requisition_annexure_rows` for that annexure+lot+type:
  - Checkbox · Material · Size · Make · Qty · Unit · **PO Status** (none / `po_status` badge).
- Rows where `po_status='created'` are shown **disabled + greyed** with a "PO Created" badge so they can't be re-picked. They become selectable again only after that PO is cancelled (existing `cancel_purchase_order` already clears `po_status`/`po_id`).
- "Select all eligible" master checkbox.
- Per-row inputs (only when ticked): **Rate**, **Discount %** (default 0), **GST %** (default 18), **Due On** (date). Line amount + GST amount computed live.

### B. PO preview / form (bottom) — the **fixed K.D template** rendered on screen
A live, on-page preview using the exact same component that drives the PDF, so what the user sees is what downloads. Sections, top-to-bottom, matching the uploaded sample:
- Title `PURCHASE ORDER`, PO No (auto-preview: next `PO/<FY>/####`), Date.
- `Invoice To :` / `SHIP TO :` block — editable inline, prefilled from `purchase_settings` singleton (GMG defaults).
- `VENDOR DETAILS` — `VendorCombobox` (existing) for the category; inline "+ Add new vendor" stays available. Selecting a vendor fills name/address/GSTIN/state code/contact/phone/email below.
- `REQ NO. / PROJECT`, `Supplier's Ref/Order`, `Dispatch through`, `Destination`, `Transport`, `Mode & Terms Of Payment`, `Prepared By` — text inputs with sensible defaults.
- **Items table** populated live from ticked rows: `S.NO · DESCRIPTION · DUE ON · QTY · RATE/UNIT · DISCOUNT · GST % · GST AMOUNT · AMOUNT`.
- Totals block: `TOTAL QTY`, `BASIC`, `IGST`, `GRAND TOTAL`, plus amount-in-words (uses existing `amountInWords.ts`).
- `Terms Of Delivery` + `Notes` text areas, defaults from `purchase_settings.terms`.

### Bottom action bar
- **Download PDF preview** (works any time after a vendor + ≥1 row is filled; does not save).
- **Generate PO** (primary): saves and downloads.
- **Cancel** (back to AnnexureFolder).

No "Send Email" button on this page for now — kept on PO Folder row only, where it's already wired and disabled when Resend isn't connected.

## 3. Generate PO action

On click:
1. Validate: ≥1 row ticked, vendor chosen, all ticked rows have `rate > 0`.
2. Call `next_po_number(fy)` (already in DB).
3. Insert `purchase_orders` row: `po_number`, `category`, `vendor_id`, `buyer_block`, `terms`, `subtotal`, `tax_total`, `grand_total`, `amount_in_words`, `prepared_by_name`, `annexure_ids=[annexureId]`, `created_by=auth.uid()`, `status='created'`.
4. Insert `purchase_order_rows` for each selected row (`requisition_raw_material_id` link, `material`, `size`, `make`, `qty`, `unit`, `due_on`, `rate`, `discount_pct`, `gst_pct`, `gst_amount`, `line_amount`).
5. Update `requisition_raw_materials` of those rows: `po_status='created'`, `po_id=<new>`. *(For annexure rows that are not in `requisition_raw_materials` directly, mirror the flag onto `requisition_annexure_rows.po_status` so the selection screen can grey them out.)*
6. Generate PDF via existing `generatePoPDF` (already K.D-styled) and trigger download.
7. Toast success, navigate to `/purchase/po-folder` with the new PO highlighted (optional).

Duplicate guard already enforced server-side: if any selected `requisition_raw_materials.po_status='created'`, the insert is rejected and a clear toast is shown. UI also greys them out so this is a safety net.

## 4. Email is non-blocking

- `PoFolder` Send button stays. Its existing "Email service not configured" disabled state is kept; no new prompts, no Resend connector flow is triggered from this change.
- Nothing in the create flow depends on email.

## 5. Schema changes

Minimal, additive only. One migration:

- `requisition_annexure_rows`: add `po_status text` and `po_id uuid references public.purchase_orders(id) on delete set null` (nullable; no backfill needed).
- Add `annexure_row_id uuid references public.requisition_annexure_rows(id) on delete set null` to `purchase_order_rows` so cancel can mirror-clear annexure rows.
- Update `cancel_purchase_order` SECURITY DEFINER function to also clear `po_status/po_id` on linked `requisition_annexure_rows` (in addition to existing `requisition_raw_materials` clearing). No other behavior change.
- GRANTs/RLS unchanged (columns inherit from existing table policies).

No new tables, no changes to existing rows/data.

## 6. Files

Added:
- `src/pages/purchase/PoCreateFromAnnexure.tsx` (selection + preview + generate).
- `src/components/purchase/PoTemplatePreview.tsx` (on-screen render of the K.D layout, same data shape as `PoPdfContext`).
- `supabase/migrations/<ts>_annexure_po_link.sql`.

Edited:
- `src/App.tsx` — register the new route.
- `src/pages/requisitions/AnnexureFolder.tsx` — point the existing "Generate PO" button at the new route (one-line change, no other behavior touched).
- `src/integrations/supabase/types.ts` (auto).

Untouched: `PurchaseMaterial.tsx`, `PoFolder.tsx`, `VendorCombobox.tsx`, `poPdf.ts`, `amountInWords.ts`, `send-po` edge function, every ES / BOQ / Requisition / Annexure-creation page.

## 7. Acceptance

- From an annexure row → "Generate PO" → page opens with the K.D template preview already visible.
- User can tick raw-material rows; rows already on an active PO are visibly locked.
- Vendor + rates entered → preview updates live → Download PDF or Generate PO works.
- Generated PO appears in PO Folder, items show "PO Created", same rows can't be picked again.
- Cancelling that PO from PO Folder un-locks the rows for a new PO.
- No email prompt, no Resend dependency, no changes to any other screen.
