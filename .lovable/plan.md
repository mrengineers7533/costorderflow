## Goal

Add a complete annexure → PO flow. From a created annexure the user picks materials, assigns vendors (from a small vendor master), generates POs in the K.D Enterprises layout, downloads or emails them, sees them in a new PO Folder, and can cancel/recreate. Nothing in existing ES, annexure, raw material, requisition, or current purchase flows changes.

---

## 1. Vendor master (new)

New table `public.vendors`:
- `name`, `category` (`steel` | `machine` | `3p`), `address`, `gstin`, `state_code`, `contact_person`, `phone`, `email`, `payment_terms`, `notes`, `is_active`, `created_by`.
- One vendor can serve any category (category stored per row; vendors used in multiple categories are added as multiple rows OR `category` is `text[]` — using `text[]` to keep it simple).

Admin UI: new tab in `AdminTabs` → `AdminVendors.tsx` (list / add / edit / deactivate). Route `/admin/vendors`.

On the PO create panel, vendor inputs become searchable comboboxes (filter by category) with an inline "+ Add new vendor" mini-dialog so users never need to leave the flow.

## 2. PO creation: two entry points

a) **From annexure detail** (new button on `AnnexureFolder.tsx` row → opens annexure → "Generate PO" button). Items are pre-selected from that annexure's rows.

b) **From Purchase Material** (existing page) — keep as today, just swap the free-text vendor inputs for the new vendor-master comboboxes and route through the same `createPO` helper.

Shared helper `src/lib/purchase/createPo.ts`: takes selected raw-material rows, vendor IDs per category, buyer block, terms; produces 1–N PO records (one per category that has rows + vendor); marks contributing `requisition_raw_materials` as `po_status='created'`, `po_id=...`.

## 3. PO layout (hardcoded K.D-style)

New `src/lib/purchase/poPdf.ts` replaces the current simple PDF. Layout matches the uploaded sample exactly:

```text
                        PURCHASE ORDER
                                              DATE: 23-May-2025
PO No: 07

Invoice To :                       SHIP TO:
GRAIN MILLING GROUPS PVT LTD       GRAIN MILLING GROUPS PVT LTD
Shed No.19 HSIIDC ...              Shed No.19 HSIIDC ...
GSTIN 06AALCG0511C1Z9              GSTIN 06AALCG0511C1Z9
EMAIL ...                          EMAIL ...
STATE CODE: 06                     STATE CODE: 06

VENDOR DETAILS:                    REQ NO. / PROJECT     Mode & Terms Of Payment
M/s K.D ENTERPRISES                                       NEFT/RTGS
Address ...                        Supplier's Ref/Order   Prepared By: <user>
GSTIN ...                          DIspatch through       Destination
Contact / Phone / Email            Transport BY ROAD      MURTHAL/SONIPAT

┌────┬──────────────┬───────┬──────┬──────┬────────┬─────┬──────────┬────────┐
│S.NO│ DESCRIPTION  │DUE ON │QTY   │RATE  │DISCOUNT│GST %│GST AMOUNT│ AMOUNT │
└────┴──────────────┴───────┴──────┴──────┴────────┴─────┴──────────┴────────┘

TOTAL QTY  N                       BASIC        ...
<amount in words>                  IGST 18%     ...
                                   GRAND TOTAL  ...

Terms Of Delivery: Freight Extra…  Payment 30 Days After Delivery…
```

Built with pdf-lib (manual layout, not jspdf-autotable) for pixel-control. Same helper exposes `generatePoPdfBytes(po)` (used by download + email attachment).

**Editable per PO** at create time: buyer block (Invoice To/Ship To/GSTIN/state code/email — defaults stored in a new singleton `purchase_settings` row, prefilled into the form, user can override). Vendor block comes from the chosen vendor. Item rows from annexure. Rate/Discount/GST% per row are entered by the user on the create panel (defaults: rate=0, discount=0%, GST=18%); totals computed live.

## 4. PO Folder (new)

Route `/purchase/po-folder` and a 4th card on `PurchaseLanding`.

Table columns: PO No · Lot No(s) · Vendor · Category · Annexure Ref · Created Date · Created By · Status · Actions (Download / Send / Cancel).

Filters: status (all/active/cancelled), category, vendor, lot, date range.

Row click → PO detail drawer (line items, totals, buyer/vendor blocks, send/cancel history).

## 5. Cancel & recreate

`Cancel` on a PO:
- Sets `purchase_orders.status='cancelled'`, records `cancelled_by/at/reason`.
- Clears `po_status` and `po_id` on its `requisition_raw_materials` rows (via existing FK ON DELETE pattern — handled in a `cancel_purchase_order` SECURITY DEFINER function so it's atomic).
- Logs an entry in `purchase_order_audit` (new small table: `po_id`, `action`, `actor`, `at`, `notes`).

Cancelled POs stay visible in PO Folder (filtered out from "active" badge counts). Their items are immediately eligible for a fresh PO. New PO gets a new PO number; the cancelled one is retained as history. Linked annexure/raw-material rows reflect "PO Cancelled · eligible to re-PO".

Duplicate guard: `createPo` rejects any row whose current `po_status='created'` (DB-side check + UI badge), so the only way to make a second PO for the same item is to cancel the first.

## 6. Send via Resend

- Use the Resend connector (`standard_connectors--connect` with `connector_id: resend`).
- New Edge Function `send-po` (`supabase/functions/send-po/index.ts`):
  - Auth: validate JWT, load PO + rows server-side from `po_id`.
  - Regenerates PDF server-side (port of `poPdf.ts` to Deno using pdf-lib via `npm:pdf-lib`).
  - Calls Resend `/emails` through the gateway with PDF as base64 attachment, `to=vendor.email`, `cc=optional buyer email`, subject `PO <po_number> – <buyer name>`.
  - On success writes `purchase_order_sends` row (`po_id`, `to_email`, `cc`, `sent_by`, `sent_at`, `status`, `error`).
- Frontend `Send` button asks for optional CC + custom message, then invokes the function. Disabled if vendor has no email.
- Resend domain step happens through the connector flow — user is not asked for a secret directly.

## 7. Database (one migration)

New tables (all in `public`, with GRANTs + RLS + `set_updated_at`):
- `vendors`
- `purchase_settings` (singleton row id=1 for default buyer block)
- `purchase_order_audit`
- `purchase_order_sends`

Extend existing:
- `purchase_orders`: add `annexure_ids uuid[]` (already there), `buyer_block jsonb`, `terms text`, `subtotal numeric`, `tax_total numeric`, `grand_total numeric`, `amount_in_words text`, `prepared_by_name text`, `cancelled_by`, `cancelled_at`, `cancel_reason`, `vendor_id uuid references vendors(id)`.
- `purchase_order_rows`: add `due_on date`, `rate numeric`, `discount_pct numeric`, `gst_pct numeric`, `gst_amount numeric`, `line_amount numeric`.

New SECURITY DEFINER function: `cancel_purchase_order(_po_id uuid, _reason text)` — checks ownership/role, flips status, clears `po_status/po_id` on contributing rows, writes audit row.

RLS: authenticated users read all POs; insert/cancel limited to `created_by = auth.uid()` OR `has_role(auth.uid(),'admin')`. `service_role` full access. Vendors readable by all authenticated, write by admin only.

## 8. Sidebar / routing

- `App.tsx`: add `/admin/vendors`, `/purchase/po-folder`, and `/annexures/:id/create-po` (under `RequireModule module="purchase"` for PO routes, admin guard for vendors).
- `PurchaseLanding.tsx`: 4 cards (BOQ Folder, Approved BOQs, Purchase Material, PO Folder).
- `AnnexureFolder.tsx`: add "Generate PO" action on each annexure row → routes to `/annexures/:id/create-po`.
- `AdminTabs.tsx`: add "Vendors" tab.

No changes to ES Page, Requisition Plan business logic, BOQ flow, or existing approved-BOQ list.

## 9. Files

Added:
- `src/pages/admin/AdminVendors.tsx`
- `src/pages/purchase/PoFolder.tsx`
- `src/pages/purchase/PoCreate.tsx` (used from annexure entry point; Purchase Material reuses the same form component)
- `src/components/purchase/PoCreatePanel.tsx`
- `src/components/purchase/VendorCombobox.tsx`
- `src/lib/purchase/poPdf.ts` (rewritten with pdf-lib, K.D layout)
- `src/lib/purchase/createPo.ts`
- `src/lib/purchase/amountInWords.ts`
- `supabase/functions/send-po/index.ts`
- `supabase/migrations/<ts>_po_vendors_send.sql`

Edited:
- `src/pages/purchase/PurchaseLanding.tsx` (+ PO Folder card)
- `src/pages/purchase/PurchaseMaterial.tsx` (swap free-text vendor inputs → VendorCombobox; route through `createPo`)
- `src/pages/requisitions/AnnexureFolder.tsx` (Generate PO action)
- `src/components/admin/AdminTabs.tsx`, `src/App.tsx`
- `src/integrations/supabase/types.ts` (auto)

## 10. Out of scope

- Marketing emails / bulk send / vendor portal.
- No edits to ES Page, BOQ editor, requisition flow, annexure creation logic.
- No payment processing, GRN/inward, or PO acceptance workflow.
- No XLSX template upload — layout is hardcoded per your decision.

## 11. Acceptance

- Admin → Vendors tab can add/edit Steel/Machine/3P vendors with email.
- From an active annexure row, "Generate PO" opens a form pre-filled with annexure items; assigning vendors per category and clicking Create produces 1–N POs, each with a PDF download in K.D-style layout.
- Same flow available from Purchase Material with lot/category filters.
- PO Folder lists every PO with the requested columns, filters, and Download / Send / Cancel actions.
- Send delivers PDF via Resend to the vendor email; log row recorded.
- Cancelling a PO marks it cancelled, frees its items for re-PO, and keeps the cancelled PO visible.
- Trying to PO an item that already has `po_status='created'` is blocked in UI and DB.
- All existing purchase, annexure, requisition, ES flows continue to work unchanged.

To enable Send, I'll prompt you to connect the Resend connector when we hit that step.
